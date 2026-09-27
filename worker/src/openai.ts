import { buildModelMessages } from './prompt'
import type { EditRequest, Env } from './types'

const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_BASE = 'https://api.openai.com/v1'

export class ProviderError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
  }
}

export interface OpenAiCall {
  url: string
  headers: Record<string, string>
  body: {
    model: string
    temperature: number
    max_completion_tokens: number
    response_format: {
      type: 'json_schema'
      json_schema: {
        name: string
        strict: boolean
        schema: Record<string, unknown>
      }
    }
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  }
}

export function buildOpenAiCall(env: Env, edit: EditRequest): OpenAiCall {
  const model = env.OPENAI_MODEL?.trim() || DEFAULT_MODEL
  const base = (env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, '')
  return {
    url: `${base}/chat/completions`,
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: {
      model,
      temperature: 0.2,
      max_completion_tokens: 16384,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'page_edit',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              document: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['document', 'message'],
            additionalProperties: false,
          },
        },
      },
      messages: buildModelMessages(edit),
    },
  }
}

function unwrapJson(content: string): unknown {
  let text = content.trim()
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  if (fenced?.[1]) text = fenced[1].trim()
  return JSON.parse(text)
}

export function parseModelContent(content: string): { document: string; message: string } {
  let parsed: unknown
  try {
    parsed = unwrapJson(content)
  } catch {
    throw new ProviderError('The model did not return JSON.', 502)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ProviderError('The model did not return a document.', 502)
  }
  const record = parsed as { document?: unknown; message?: unknown }
  if (typeof record.document !== 'string' || !record.document.trim()) {
    throw new ProviderError('The model did not return a document.', 502)
  }
  if (record.document.length > 80_000) {
    throw new ProviderError('The model returned a document that is too long.', 502)
  }
  const message =
    typeof record.message === 'string' && record.message.trim()
      ? record.message.trim().slice(0, 2_000)
      : 'Updated the page.'
  return { document: record.document, message }
}

function readAssistantContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new ProviderError('The AI provider returned an unreadable response.', 502)
  }
  const choice = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choice) || !choice[0] || typeof choice[0] !== 'object') {
    throw new ProviderError('The AI provider returned an unreadable response.', 502)
  }
  const first = choice[0] as {
    finish_reason?: string
    message?: { content?: string | null; refusal?: string | null }
  }
  if (first.message?.refusal) {
    throw new ProviderError('The AI provider declined this edit.', 502)
  }
  if (first.finish_reason === 'length') {
    throw new ProviderError('The page is too long for the model to return in one response. Shorten it and try again.', 502)
  }
  if (first.finish_reason === 'content_filter') {
    throw new ProviderError('The AI provider declined this edit.', 502)
  }
  const content = first.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new ProviderError('The model returned an empty response.', 502)
  }
  return content
}

export async function completeEdit(env: Env, edit: EditRequest): Promise<{ document: string; message: string }> {
  const apiKey = env.OPENAI_API_KEY?.trim() ?? ''
  if (!apiKey) {
    throw new ProviderError('The Worker is missing OPENAI_API_KEY.', 500)
  }

  const call = buildOpenAiCall({ ...env, OPENAI_API_KEY: apiKey }, edit)
  let response: Response
  try {
    response = await fetch(call.url, {
      method: 'POST',
      headers: call.headers,
      body: JSON.stringify(call.body),
      signal: AbortSignal.timeout(25_000),
    })
  } catch (err) {
    console.error('openai network error', err instanceof Error ? err.name : 'Error')
    throw new ProviderError('The AI provider did not respond.', 504)
  }

  if (!response.ok) {
    console.error('openai request failed', response.status)
    if (response.status === 401) {
      throw new ProviderError('OpenAI rejected the API key on the Worker.', 502)
    }
    if (response.status === 429) {
      throw new ProviderError('OpenAI rate limit reached. Try again shortly.', 502)
    }
    throw new ProviderError('The AI provider rejected the request.', 502)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ProviderError('The AI provider returned an unreadable response.', 502)
  }

  const parsed = parseModelContent(readAssistantContent(payload))
  if (parsed.document.includes(apiKey) || parsed.message.includes(apiKey)) {
    throw new ProviderError('The model response was discarded.', 502)
  }
  return parsed
}
