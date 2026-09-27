import { LIMITS } from './limits'
import type { ChatMessage, EditRequest, ElementSelection } from './types'

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://maysentg.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

export function parseAllowedOrigins(raw: string | undefined): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS
}

export function matchAllowedOrigin(origin: string | null, allowed: string[]): string | null {
  if (!origin) return null
  return allowed.includes(origin) ? origin : null
}

export function applyCors(headers: Headers, allowOrigin: string | null): void {
  if (allowOrigin) {
    headers.set('Access-Control-Allow-Origin', allowOrigin)
    headers.set('Vary', 'Origin')
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-AI-Gate')
  headers.set('Access-Control-Max-Age', '86400')
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
}

/** Constant-time string compare that does not throw on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  const length = Math.max(left.length, right.length)
  let mismatch = left.length === right.length ? 0 : 1
  for (let i = 0; i < length; i++) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return mismatch === 0
}

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

export function checkRateLimit(
  buckets: Map<string, number[]>,
  key: string,
  now: number,
  windowMs = LIMITS.rateLimitWindowMs,
  max = LIMITS.rateLimitMax,
): RateLimitDecision {
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs)
  if (recent.length >= max) {
    buckets.set(key, recent)
    const oldest = recent[0] ?? now
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    }
  }
  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > 1000) {
    const oldestKey = buckets.keys().next().value
    if (oldestKey) buckets.delete(oldestKey)
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

function readString(value: unknown, max: number, label: string): string | { ok: false; error: string } {
  if (typeof value !== 'string') return fail(`${label} must be a string.`)
  if (value.length > max) return fail(`${label} is too long.`)
  return value
}

export function validateEditRequest(input: unknown): { ok: true; value: EditRequest } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('Request body must be a JSON object.')
  }
  const body = input as Record<string, unknown>

  if (typeof body.document !== 'string') return fail('document must be a string.')
  if (!body.document.trim()) return fail('document is empty.')
  if (body.document.length > LIMITS.maxDocumentChars) return fail('document is too long.')

  if (!body.selection || typeof body.selection !== 'object' || Array.isArray(body.selection)) {
    return fail('selection must describe the element you clicked.')
  }
  const rawSelection = body.selection as Record<string, unknown>
  const tag = readString(rawSelection.tag, LIMITS.maxTagChars, 'selection.tag')
  if (typeof tag !== 'string') return tag
  if (!tag.trim()) return fail('selection.tag is empty.')
  const label = readString(rawSelection.label, LIMITS.maxLabelChars, 'selection.label')
  if (typeof label !== 'string') return label
  if (!label.trim()) return fail('selection.label is empty.')
  const textExcerpt = readString(rawSelection.textExcerpt, LIMITS.maxExcerptChars, 'selection.textExcerpt')
  if (typeof textExcerpt !== 'string') return textExcerpt
  const positionHint = readString(rawSelection.positionHint, LIMITS.maxHintChars, 'selection.positionHint')
  if (typeof positionHint !== 'string') return positionHint
  if (!Number.isInteger(rawSelection.index) || (rawSelection.index as number) < 0 || (rawSelection.index as number) > 100_000) {
    return fail('selection.index must be a non-negative integer.')
  }
  if (!Array.isArray(rawSelection.headingPath) || rawSelection.headingPath.length > LIMITS.maxHeadingPath) {
    return fail('selection.headingPath must be a short list of strings.')
  }
  const headingPath: string[] = []
  for (const item of rawSelection.headingPath) {
    if (typeof item !== 'string' || item.length > LIMITS.maxHeadingChars) {
      return fail('selection.headingPath must be a short list of strings.')
    }
    headingPath.push(item)
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > LIMITS.maxMessages) {
    return fail(`messages must contain 1 to ${LIMITS.maxMessages} turns.`)
  }

  const messages: ChatMessage[] = []
  for (let i = 0; i < body.messages.length; i++) {
    const item = body.messages[i]
    if (!item || typeof item !== 'object') return fail('Each message must have a role and content.')
    const record = item as Record<string, unknown>
    const expected = i % 2 === 0 ? 'user' : 'assistant'
    if (record.role !== expected) {
      return fail('messages must alternate user and assistant, starting and ending with user.')
    }
    if (typeof record.content !== 'string' || !record.content.trim()) {
      return fail('Each message needs text content.')
    }
    if (record.content.length > LIMITS.maxMessageChars) return fail('A message is too long.')
    messages.push({ role: expected, content: record.content })
  }
  if (messages[messages.length - 1]?.role !== 'user') {
    return fail('The last message must be the user instruction.')
  }

  const selection: ElementSelection = {
    tag,
    label,
    textExcerpt,
    headingPath,
    positionHint,
    index: rawSelection.index as number,
  }

  return {
    ok: true,
    value: {
      document: body.document,
      selection,
      messages,
    },
  }
}
