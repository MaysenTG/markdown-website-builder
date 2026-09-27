import { LIMITS } from './limits'
import { completeEdit, ProviderError } from './openai'
import {
  applyCors,
  checkRateLimit,
  matchAllowedOrigin,
  parseAllowedOrigins,
  safeEqual,
  validateEditRequest,
} from './policy'
import type { EditRequest, Env } from './types'

export interface FetchDeps {
  buckets: Map<string, number[]>
  now: () => number
  complete: (env: Env, edit: EditRequest) => Promise<{ document: string; message: string }>
}

const defaultBuckets = new Map<string, number[]>()

function corsHeaders(allowOrigin: string | null, extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  applyCors(headers, allowOrigin)
  return headers
}

function json(body: unknown, status: number, allowOrigin: string | null, extra?: HeadersInit): Response {
  const headers = corsHeaders(allowOrigin, extra)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

export async function handleFetch(request: Request, env: Env, deps?: Partial<FetchDeps>): Promise<Response> {
  const buckets = deps?.buckets ?? defaultBuckets
  const now = deps?.now ?? (() => Date.now())
  const complete = deps?.complete ?? completeEdit

  const origin = request.headers.get('Origin')
  const allowOrigin = matchAllowedOrigin(origin, parseAllowedOrigins(env.ALLOWED_ORIGINS))

  if (request.method === 'OPTIONS') {
    if (!allowOrigin) {
      return json({ error: 'This origin is not allowed to use the AI proxy.' }, 403, null)
    }
    return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) })
  }

  if (request.method === 'GET') {
    if (origin && !allowOrigin) {
      return json({ error: 'This origin is not allowed to use the AI proxy.' }, 403, null)
    }
    return json({ ok: true }, 200, allowOrigin)
  }

  if (request.method !== 'POST') {
    return json({ error: 'Use POST to edit a page.' }, 405, allowOrigin)
  }

  if (!allowOrigin) {
    return json({ error: 'This origin is not allowed to use the AI proxy.' }, 403, null)
  }

  const gate = env.GATE_TOKEN?.trim() ?? ''
  if (gate) {
    const presented = request.headers.get('X-AI-Gate')?.trim() ?? ''
    if (!presented || !safeEqual(presented, gate)) {
      return json({ error: 'AI proxy gate token was missing or incorrect.' }, 401, allowOrigin)
    }
  }

  if (!env.OPENAI_API_KEY?.trim()) {
    return json({ error: 'The Worker is missing OPENAI_API_KEY.' }, 500, allowOrigin)
  }

  const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown'
  const limit = checkRateLimit(buckets, ip, now())
  if (!limit.allowed) {
    return json(
      { error: 'Too many AI edits from this network. Try again in a minute.' },
      429,
      allowOrigin,
      { 'Retry-After': String(limit.retryAfterSeconds) },
    )
  }

  const advertised = Number(request.headers.get('Content-Length') ?? '0')
  if (Number.isFinite(advertised) && advertised > LIMITS.maxBodyBytes) {
    return json({ error: 'Request is too large.' }, 413, allowOrigin)
  }

  let raw = ''
  try {
    raw = await request.text()
  } catch {
    return json({ error: 'Request body could not be read.' }, 400, allowOrigin)
  }
  if (raw.length > LIMITS.maxBodyBytes) {
    return json({ error: 'Request is too large.' }, 413, allowOrigin)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400, allowOrigin)
  }

  const validated = validateEditRequest(parsed)
  if (!validated.ok) {
    return json({ error: validated.error }, 400, allowOrigin)
  }

  try {
    const result = await complete(env, validated.value)
    return json(result, 200, allowOrigin)
  } catch (err) {
    if (err instanceof ProviderError) {
      return json({ error: err.message }, err.status, allowOrigin)
    }
    console.error('edit failed', err instanceof Error ? err.name : 'Error')
    return json({ error: 'The AI request failed.' }, 502, allowOrigin)
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env)
  },
}
