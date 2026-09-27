import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { inputPlaceholder, selectionTitle } from '../../lib/ai/describeSelection'
import { LIMITS } from '../../lib/ai/limits'
import type { AiChatMessage, ElementSelection } from '../../lib/ai/types'

const THINKING_PHRASES = [
  'Reading the page…',
  'Focusing on your selection…',
  'Rewriting markdown…',
  'Checking frontmatter…',
]

interface AiChatPanelProps {
  selection: ElementSelection
  sessionId: number
  messages: AiChatMessage[]
  phase: 'idle' | 'thinking' | 'applying' | 'error'
  error: string | null
  draft: string
  onDraft: (value: string) => void
  onSend: () => void
  onClose: () => void
}

function Thinking() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % THINKING_PHRASES.length)
    }, 1600)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="ai-thinking" role="status">
      <span className="ai-thinking__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>{THINKING_PHRASES[index]}</span>
    </div>
  )
}

export function AiChatPanel({
  selection,
  sessionId,
  messages,
  phase,
  error,
  draft,
  onDraft,
  onSend,
  onClose,
}: AiChatPanelProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const busy = phase === 'thinking' || phase === 'applying'
  const title = selectionTitle(selection)

  useEffect(() => {
    inputRef.current?.focus()
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, phase, error])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSend()
  }

  return (
    <div
      className={`ai-chat ${busy ? 'is-busy' : ''}`}
      role="dialog"
      aria-label="Edit with AI"
      data-ai-phase={phase}
    >
      <div className={`ai-chat__progress ${busy ? 'is-on' : ''}`} />
      <header className="ai-chat__header">
        <div className="ai-chat__heading">
          <span className="ai-chat__kicker">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6 0.6 7.1 4.2 10.8 4.4 7.9 6.7 8.9 10.3 6 8.2 3.1 10.3 4.1 6.7 1.2 4.4 4.9 4.2Z"
              />
            </svg>
            Edit with AI
          </span>
          <span className="ai-chat__target" title={title}>
            {title}
          </span>
          <span className="ai-chat__hint" title={selection.positionHint}>
            {selection.positionHint}
          </span>
        </div>
        <button type="button" className="ai-chat__close" onClick={onClose} aria-label="Close chat">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="ai-chat__messages" aria-live="polite">
        {messages.length === 0 && phase !== 'thinking' ? (
          <p className="ai-chat__empty">
            Describe a change. The assistant rewrites this page’s markdown and frontmatter, using the
            selected element as the focus.
          </p>
        ) : null}
        {messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={`ai-msg ai-msg--${message.role}`}>
            {message.content}
          </p>
        ))}
        {phase === 'thinking' ? <Thinking /> : null}
        {phase === 'applying' ? (
          <p className="ai-chat__status" role="status">
            Applying to the preview…
          </p>
        ) : null}
        {error ? (
          <p className="ai-chat__error" role="alert">
            {error}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form className="ai-chat__composer" onSubmit={submit}>
        <label className="ai-sr" htmlFor={inputId}>
          Change request
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          className="ai-chat__input"
          rows={2}
          maxLength={LIMITS.maxMessageChars}
          placeholder={inputPlaceholder(selection.tag)}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              onSend()
            }
          }}
        />
        <button
          type="submit"
          className={`ai-chat__send ${busy ? 'is-busy' : ''}`}
          disabled={busy || !draft.trim()}
          aria-label={busy ? 'Sending' : 'Send'}
        >
          {busy ? 'Sending' : 'Send'}
        </button>
      </form>
      <p className="ai-chat__keys">Enter to send · Shift+Enter for a new line · Esc exits select mode</p>
    </div>
  )
}
