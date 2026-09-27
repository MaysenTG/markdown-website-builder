export interface ElementSelection {
  tag: string
  label: string
  textExcerpt: string
  headingPath: string[]
  positionHint: string
  /** Zero-based index among elements with the same tag in the page body. */
  index: number
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiEditRequest {
  document: string
  selection: ElementSelection
  messages: AiChatMessage[]
}

export interface AiEditResponse {
  document: string
  message: string
}
