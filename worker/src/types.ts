export interface Env {
  OPENAI_API_KEY?: string
  /** Chat Completions model that supports json_schema. Default gpt-4o-mini. */
  OPENAI_MODEL?: string
  /** Override the API root. Default https://api.openai.com/v1 */
  OPENAI_BASE_URL?: string
  /** Comma-separated browser Origins. Unset uses the built-in defaults. */
  ALLOWED_ORIGINS?: string
  /** Optional shared gate. Callers must send it in X-AI-Gate. */
  GATE_TOKEN?: string
}

export interface ElementSelection {
  tag: string
  label: string
  textExcerpt: string
  headingPath: string[]
  positionHint: string
  index: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface EditRequest {
  document: string
  selection: ElementSelection
  messages: ChatMessage[]
}
