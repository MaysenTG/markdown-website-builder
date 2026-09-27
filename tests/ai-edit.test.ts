import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIMITS as clientLimits } from '../src/lib/ai/limits'
import { placePanel } from '../src/lib/ai/placePanel'
import { assertAiEditRequest, nextSourceFromAiResponse, normalizeModelDocument } from '../src/lib/ai/protocol'
import { requestAiEdit } from '../src/lib/ai/client'
import type { AiEditRequest } from '../src/lib/ai/types'
import { LIMITS as workerLimits } from '../worker/src/limits'
import { handleFetch } from '../worker/src/index'
import { buildOpenAiCall, completeEdit, parseModelContent } from '../worker/src/openai'
import { SYSTEM_PROMPT, buildModelMessages } from '../worker/src/prompt'
import { checkRateLimit, matchAllowedOrigin, parseAllowedOrigins, safeEqual, validateEditRequest } from '../worker/src/policy'
import type { Env } from '../worker/src/types'

const selection = {
  tag: 'h2',
  label: 'Heading 2',
  textExcerpt: 'Morning light',
  headingPath: ['Field Notes', 'Morning light'],
  positionHint: '1st h2 in the page · “Morning light” · under “Field Notes”',
  index: 0,
}

const current = `---
title: Field Notes
theme: light
accent: "#c45d3a"
---

# Field Notes

## Morning light

A paragraph.
`

function editRequest(instruction = 'Make this heading shorter'): AiEditRequest {
  return {
    document: current,
    selection,
    messages: [{ role: 'user', content: instruction }],
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('client payload and apply', () => {
  it('posts the document, selection, and instruction to the worker and applies the returned markdown', async () => {
    const updated = current.replace('## Morning light', '## Dawn').trim()
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example/edit/')
    vi.stubEnv('VITE_AI_GATE_TOKEN', 'gate-token')

    const seen: { url: string; headers: Record<string, string>; body: AiEditRequest }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push({
        url: String(url),
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)) as AiEditRequest,
      })
      return new Response(JSON.stringify({ document: updated, message: 'Shortened the heading to Dawn.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const request = editRequest()
    const response = await requestAiEdit(request)
    const applied = nextSourceFromAiResponse(request.document, response)

    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe('https://proxy.example/edit')
    expect(seen[0]?.headers['Content-Type']).toBe('application/json')
    expect(seen[0]?.headers['X-AI-Gate']).toBe('gate-token')
    expect(seen[0]?.headers.Authorization).toBeUndefined()
    expect(seen[0]?.body).toEqual(request)
    expect(JSON.stringify(seen[0]?.body)).not.toContain('sk-')
    expect(applied).toEqual({
      ok: true,
      source: updated,
      changed: true,
    })
    expect(response.message).toBe('Shortened the heading to Dawn.')
  })

  it('stays off when the worker URL is empty', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', '   ')
    await expect(requestAiEdit(editRequest())).rejects.toThrow(/VITE_AI_PROXY_URL/)
  })

  it('surfaces the worker error and does not replace the document', async () => {
    vi.stubEnv('VITE_AI_PROXY_URL', 'https://proxy.example')
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ error: 'Too many AI edits from this network. Try again in a minute.' }), {
          status: 429,
        }),
    )
    await expect(requestAiEdit(editRequest())).rejects.toThrow(/Too many AI edits/)
  })
})

describe('document acceptance', () => {
  it('unwraps a tagged fence and keeps valid frontmatter', () => {
    const raw = '```markdown\n---\ntitle: Hello\ntheme: dark\n---\n\n# Hello\n```'
    expect(normalizeModelDocument(raw)).toBe('---\ntitle: Hello\ntheme: dark\n---\n\n# Hello')
    const accepted = nextSourceFromAiResponse('old', {
      document: raw,
      message: 'Rewrote the page.',
    })
    expect(accepted).toEqual({
      ok: true,
      source: '---\ntitle: Hello\ntheme: dark\n---\n\n# Hello',
      changed: true,
    })
  })

  it('rejects invalid frontmatter and new script tags', () => {
    const broken = nextSourceFromAiResponse(current, {
      document: '---\ntitle: [\n---\n\n# Hi\n',
      message: 'nope',
    })
    expect(broken.ok).toBe(false)

    const unquoted = nextSourceFromAiResponse(current, {
      document: '---\ntitle: Hi\naccent: #7c9cff\n---\n\n# Hi\n',
      message: 'color',
    })
    expect(unquoted.ok).toBe(false)

    const script = nextSourceFromAiResponse(current, {
      document: `${current}\n<script>alert(1)</script>\n`,
      message: 'bad',
    })
    expect(script.ok).toBe(false)

    const already = '<p>Keep <script>alert(1)</script></p>'
    const kept = nextSourceFromAiResponse(already, {
      document: `${already}\n`,
      message: 'trimmed',
    })
    expect(kept.ok).toBe(true)
  })
})

describe('panel placement', () => {
  it('clamps the chat inside the preview and flips above a low selection', () => {
    expect(
      placePanel(
        { top: 400, left: 0, width: 100, height: 40 },
        { width: 500, height: 500 },
        { width: 300, height: 200 },
      ),
    ).toEqual({ top: 190, left: 8 })

    expect(
      placePanel(
        { top: 0, left: 400, width: 80, height: 20 },
        { width: 500, height: 400 },
        { width: 300, height: 100 },
      ).left,
    ).toBe(192)
  })
})

describe('worker origins', () => {
  it('allows Cloudflare Pages hosts and rejects the retired GitHub Pages origin', () => {
    const allowed = parseAllowedOrigins(undefined)
    expect(matchAllowedOrigin('https://markdown-website-builder.pages.dev', allowed)).toBe(
      'https://markdown-website-builder.pages.dev',
    )
    expect(matchAllowedOrigin('https://abc123.markdown-website-builder.pages.dev', allowed)).toBe(
      'https://abc123.markdown-website-builder.pages.dev',
    )
    expect(matchAllowedOrigin('https://maysentg.github.io', allowed)).toBeNull()
    expect(matchAllowedOrigin('https://evilpages.dev', allowed)).toBeNull()
    expect(matchAllowedOrigin('http://markdown-website-builder.pages.dev', allowed)).toBeNull()
    expect(matchAllowedOrigin('https://pages.dev.evil.example', allowed)).toBeNull()

    const custom = parseAllowedOrigins('https://notes.example.com,https://*.pages.dev')
    expect(matchAllowedOrigin('https://notes.example.com', custom)).toBe('https://notes.example.com')
  })
})

describe('message length', () => {
  it('caps user instructions at 100 characters and still allows a longer assistant reply', () => {
    expect(clientLimits.maxUserMessageChars).toBe(100)
    const exact = 'a'.repeat(100)
    expect(() => assertAiEditRequest(editRequest(exact))).not.toThrow()
    expect(validateEditRequest(editRequest(exact)).ok).toBe(true)

    const tooLong = 'a'.repeat(101)
    expect(() => assertAiEditRequest(editRequest(tooLong))).toThrow(/100 characters/)
    const rejected = validateEditRequest(editRequest(tooLong))
    expect(rejected.ok).toBe(false)

    const followUp = editRequest('Again')
    followUp.messages = [
      { role: 'user', content: 'Short' },
      { role: 'assistant', content: 'a'.repeat(180) },
      { role: 'user', content: 'Again' },
    ]
    expect(() => assertAiEditRequest(followUp)).not.toThrow()
    expect(validateEditRequest(followUp).ok).toBe(true)
  })

  it('sends a whole-page edit without an element path', () => {
    const request = editRequest('Tighten the introduction')
    request.selection = {
      tag: 'page',
      label: 'Entire page',
      textExcerpt: '',
      headingPath: [],
      positionHint: 'Markdown and frontmatter',
      index: 0,
    }
    expect(validateEditRequest(request).ok).toBe(true)
    const prompt = buildModelMessages(request).at(-1)?.content ?? ''
    expect(prompt).toContain('entire page')
    expect(prompt).not.toContain('Index among')
  })
})

describe('worker contract', () => {
  it('keeps client and worker limits aligned', () => {
    expect(clientLimits).toEqual(workerLimits)
  })

  it('builds an OpenAI call that keeps the API key out of the body', () => {
    const env: Env = { OPENAI_API_KEY: 'sk-test-123', OPENAI_MODEL: 'gpt-4o-mini' }
    const call = buildOpenAiCall(env, editRequest())
    const serialized = JSON.stringify(call.body)
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(call.headers.Authorization).toBe('Bearer sk-test-123')
    expect(serialized).not.toContain('sk-test-123')
    expect(call.body.messages[0]?.content).toBe(SYSTEM_PROMPT)
    expect(call.body.messages.at(-1)?.content).toContain('----- PAGE SOURCE START -----')
    expect(call.body.messages.at(-1)?.content).toContain('Make this heading shorter')
    expect(call.body.response_format.json_schema.schema).toMatchObject({
      required: ['document', 'message'],
      additionalProperties: false,
    })
    expect(SYSTEM_PROMPT).toContain('hideChrome')
    expect(SYSTEM_PROMPT).toContain('accent')
  })

  it('does not echo provider error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ error: { message: 'bad key sk-test-123' } }), { status: 401 }),
    )
    await expect(completeEdit({ OPENAI_API_KEY: 'sk-test-123' }, editRequest())).rejects.toThrow(
      /rejected the API key/,
    )
    await expect(completeEdit({ OPENAI_API_KEY: 'sk-test-123' }, editRequest())).rejects.not.toThrow(/sk-test-123/)
  })

  it('parses a fenced model payload', () => {
    expect(parseModelContent('```json\n{"document":"# Hi\\n","message":"Done."}\n```')).toEqual({
      document: '# Hi\n',
      message: 'Done.',
    })
  })

  it('rejects a bad edit body and accepts a well-formed one', () => {
    expect(validateEditRequest({ document: '' }).ok).toBe(false)
    const validated = validateEditRequest(editRequest())
    expect(validated.ok).toBe(true)
    if (validated.ok) expect(validated.value.selection.tag).toBe('h2')
  })

  it('enforces origin, gate, size, and rate limits before calling the model', async () => {
    const buckets = new Map<string, number[]>()
    const complete = vi.fn(async () => ({ document: '# Updated\n', message: 'Updated the page.' }))
    const env: Env = { OPENAI_API_KEY: 'sk-test-123', GATE_TOKEN: 'gate-token' }
    const body = JSON.stringify(editRequest())

    const denied = await handleFetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body,
      }),
      env,
      { buckets, complete, now: () => 1_000 },
    )
    expect(denied.status).toBe(403)
    expect(complete).not.toHaveBeenCalled()

    const gated = await handleFetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
        body,
      }),
      env,
      { buckets, complete, now: () => 1_000 },
    )
    expect(gated.status).toBe(401)

    const preflight = await handleFetch(
      new Request('https://worker.test/', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }),
      env,
      { buckets, complete },
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('X-AI-Gate')

    const ok = await handleFetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: {
          Origin: 'https://abc123.markdown-website-builder.pages.dev',
          'Content-Type': 'application/json',
          'X-AI-Gate': 'gate-token',
          'CF-Connecting-IP': '203.0.113.5',
        },
        body,
      }),
      env,
      { buckets, complete, now: () => 1_000 },
    )
    expect(ok.status).toBe(200)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://abc123.markdown-website-builder.pages.dev',
    )
    expect(await ok.json()).toEqual({ document: '# Updated\n', message: 'Updated the page.' })
    expect(complete).toHaveBeenCalledTimes(1)
    const forwarded = complete.mock.calls[0]?.[1]
    expect(forwarded?.document).toBe(current)
    expect(forwarded?.messages.at(-1)?.content).toBe('Make this heading shorter')
    expect(JSON.stringify(forwarded)).not.toContain('sk-test-123')

    const huge = await handleFetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:5173',
          'X-AI-Gate': 'gate-token',
          'CF-Connecting-IP': '203.0.113.8',
        },
        body: JSON.stringify({ document: 'x'.repeat(workerLimits.maxBodyBytes) }),
      }),
      env,
      { buckets, complete, now: () => 2_000 },
    )
    expect(huge.status).toBe(413)
    expect(complete).toHaveBeenCalledTimes(1)

    expect(safeEqual('gate-token', 'gate-token')).toBe(true)
    expect(safeEqual('gate-token', 'other')).toBe(false)

    const localBuckets = new Map<string, number[]>()
    for (let i = 0; i < workerLimits.rateLimitMax; i++) {
      expect(checkRateLimit(localBuckets, '203.0.113.9', 5_000).allowed).toBe(true)
    }
    expect(checkRateLimit(localBuckets, '203.0.113.9', 5_000).allowed).toBe(false)
  })
})
