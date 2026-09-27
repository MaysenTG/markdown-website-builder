import { load } from 'js-yaml'
import { LIMITS } from './limits'
import type { AiChatMessage, AiEditRequest, AiEditResponse, ElementSelection } from './types'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
const TAGGED_FENCE_RE = /^```(?:markdown|md|yaml|yml)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/i
const STRING_KEYS = ['title', 'maxWidth', 'font', 'background', 'accent', 'css'] as const
const THEMES = new Set(['light', 'dark', 'auto'])

export class AiEditError extends Error {
  status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'AiEditError'
    this.status = status
  }
}

export type AcceptResult =
  | { ok: true; document: string }
  | { ok: false; error: string }

function fail(error: string): AcceptResult {
  return { ok: false, error }
}

export function trimMessages(messages: AiChatMessage[]): AiChatMessage[] {
  const sliced = messages.slice(-LIMITS.maxMessages)
  if (sliced[0]?.role === 'assistant') sliced.shift()
  return sliced
}

export function normalizeModelDocument(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '').trim()
  const fenced = text.match(TAGGED_FENCE_RE)
  if (fenced?.[1]) text = fenced[1].trim()

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { document?: unknown; message?: unknown }
      if (typeof parsed.document === 'string' && typeof parsed.message === 'string') {
        text = parsed.document.replace(/^\uFEFF/, '').trim()
        const inner = text.match(TAGGED_FENCE_RE)
        if (inner?.[1]) text = inner[1].trim()
      }
    } catch {
      /* The page itself may be JSON-looking prose. Keep it. */
    }
  }

  return text
}

function hasScriptTag(text: string): boolean {
  return /<script\b/i.test(text)
}

function validateFrontmatter(document: string): string | null {
  if (!document.startsWith('---')) return null
  const match = document.match(FRONTMATTER_RE)
  if (!match) {
    return 'Frontmatter must start and end with a --- line. Nothing was changed.'
  }

  const yamlText = match[1] ?? ''
  if (!yamlText.trim()) return null

  let parsed: unknown
  try {
    parsed = load(yamlText)
  } catch {
    return 'Frontmatter YAML could not be parsed. Quote colors that start with #. Nothing was changed.'
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'Frontmatter must be a YAML mapping of page settings. Nothing was changed.'
  }

  const record = parsed as Record<string, unknown>
  for (const key of STRING_KEYS) {
    if (!(key in record) || record[key] === undefined) continue
    if (typeof record[key] !== 'string') {
      const hint = key === 'accent' || key === 'background' ? ' Quote values that start with #.' : ''
      return `Frontmatter ${key} must be a string.${hint} Nothing was changed.`
    }
  }

  if ('theme' in record && record.theme !== undefined && record.theme !== null) {
    if (typeof record.theme !== 'string' || !THEMES.has(record.theme)) {
      return 'Frontmatter theme must be light, dark, or auto. Nothing was changed.'
    }
  }

  if ('hideChrome' in record && record.hideChrome !== undefined && record.hideChrome !== null) {
    if (typeof record.hideChrome !== 'boolean') {
      return 'Frontmatter hideChrome must be true or false. Nothing was changed.'
    }
  }

  return null
}

/** Accept a model document only when it is safe to replace the editor source. */
export function acceptModelDocument(raw: string, previous?: string): AcceptResult {
  const document = normalizeModelDocument(raw)
  if (!document.trim()) {
    return fail('The model returned an empty document. Nothing was changed.')
  }
  if (document.length > LIMITS.maxDocumentChars) {
    return fail('The model returned a document that is too long. Nothing was changed.')
  }
  if (hasScriptTag(document) && !(previous && hasScriptTag(previous))) {
    return fail('The edit tried to add a script tag. Nothing was changed.')
  }
  const yamlError = validateFrontmatter(document)
  if (yamlError) return fail(yamlError)
  return { ok: true, document }
}

export function nextSourceFromAiResponse(
  current: string,
  response: AiEditResponse,
): { ok: true; source: string; changed: boolean } | { ok: false; error: string } {
  const accepted = acceptModelDocument(response.document, current)
  if (!accepted.ok) return accepted
  return { ok: true, source: accepted.document, changed: accepted.document !== current }
}

function isSelection(value: unknown): value is ElementSelection {
  if (!value || typeof value !== 'object') return false
  const selection = value as Partial<ElementSelection>
  return (
    typeof selection.tag === 'string' &&
    typeof selection.label === 'string' &&
    typeof selection.textExcerpt === 'string' &&
    Array.isArray(selection.headingPath) &&
    typeof selection.positionHint === 'string' &&
    typeof selection.index === 'number'
  )
}

/** Client-side check before the request leaves the browser. */
export function assertAiEditRequest(request: AiEditRequest): void {
  if (!request.document.trim()) {
    throw new AiEditError('There is no page source to edit.')
  }
  if (request.document.length > LIMITS.maxDocumentChars) {
    throw new AiEditError('This page is too long to send to the AI editor.')
  }
  if (!isSelection(request.selection)) {
    throw new AiEditError('Select an element in the preview before asking for an edit.')
  }
  const messages = trimMessages(request.messages)
  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    throw new AiEditError('Write a change to send to the AI editor.')
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    if (!message) continue
    const expected = i % 2 === 0 ? 'user' : 'assistant'
    if (message.role !== expected) {
      throw new AiEditError('The chat transcript could not be sent. Start a new selection and try again.')
    }
    if (!message.content.trim()) {
      throw new AiEditError('That message is empty or too long.')
    }
    const limit = message.role === 'user' ? LIMITS.maxUserMessageChars : LIMITS.maxResponseMessageChars
    if (message.content.length > limit) {
      throw new AiEditError(
        message.role === 'user'
          ? `Keep each instruction under ${LIMITS.maxUserMessageChars} characters.`
          : 'That message is empty or too long.',
      )
    }
  }
}

export function parseAiEditResponse(payload: unknown): AiEditResponse {
  if (!payload || typeof payload !== 'object') {
    throw new AiEditError('The AI proxy returned an unreadable response.')
  }
  const record = payload as { document?: unknown; message?: unknown; error?: unknown }
  if (typeof record.document !== 'string') {
    const fallback = typeof record.error === 'string' ? record.error : 'The AI proxy did not return a document.'
    throw new AiEditError(fallback)
  }
  const message = typeof record.message === 'string' && record.message.trim()
    ? record.message.trim().slice(0, LIMITS.maxResponseMessageChars)
    : 'Updated the page.'
  return { document: record.document, message }
}
