import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { inputPlaceholder, selectionTitle } from '../../lib/ai/describeSelection'
import { LIMITS } from '../../lib/ai/limits'
import type { AiChatMessage, ElementSelection } from '../../lib/ai/types'

const THINKING_PHRASES = [
  'Reading the page…',
  'Rewriting markdown…',
  'Checking frontmatter…',
]

interface AiChatPanelProps {
  selection: ElementSelection
  sessionId: number
  messages: AiChatMessage[]
  phase: 'idle' | 'thinking' | 'applying' | 'pending' | 'error'
  pending: boolean
  scope: 'page' | 'section'
  error: string | null
  draft: string
  onDraft: (value: string) => void
  onSend: () => void
  onAccept: () => void
  onReject: () => void
  onClose: () => void
}

function Thinking({ scope }: { scope: 'page' | 'section' }) {
  const phrases =
    scope === 'page' ? ['Reading the whole page…', ...THINKING_PHRASES.slice(1)] : ['Focusing on your selection…', ...THINKING_PHRASES]
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % phrases.length)
    }, 1600)
    return () => window.clearInterval(timer)
  }, [phrases.length])

  return (
    <div className="ai-thinking" role="status">
      <span className="ai-thinking__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>{phrases[index]}</span>
    </div>
  )
}

export function AiChatPanel({
  selection,
  sessionId,
  messages,
  phase,
  pending,
  scope,
  error,
  draft,
  onDraft,
  onSend,
  onAccept,
  onReject,
  onClose,
}: AiChatPanelProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wasPending = useRef(false)
  const busy = phase === 'thinking' || phase === 'applying'
  const title = selectionTitle(selection)
  const composerLocked = busy || pending
  const count = draft.length
  const atLimit = count >= LIMITS.maxUserMessageChars
  const countId = `${inputId}-count`

  useEffect(() => {
    inputRef.current?.focus()
  }, [sessionId])

  useEffect(() => {
    if (wasPending.current && !pending) inputRef.current?.focus()
    wasPending.current = pending
  }, [pending])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, phase, error, pending])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSend()
  }

  return (
    <div
      className={`ai-chat ${busy ? 'is-busy' : ''} ${pending ? 'ai-chat--pending' : ''}`}
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
        <button
          type="button"
          className="ai-chat__close"
          onClick={onClose}
          aria-label={pending ? 'Discard preview and close' : 'Close chat'}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="ai-chat__messages" aria-live="polite">
        {messages.length === 0 && phase !== 'thinking' ? (
          <p className="ai-chat__empty">
            {scope === 'page' ? 'Use AI to enhance this page' : 'Use AI to enhance the section you selected'}
          </p>
        ) : null}
        {messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={`ai-msg ai-msg--${message.role}`}>
            {message.content}
          </p>
        ))}
        {phase === 'thinking' ? <Thinking scope={scope} /> : null}
        {phase === 'applying' ? (
          <p className="ai-chat__status" role="status">
            Applying to the preview…
          </p>
        ) : null}
        {pending ? (
          <p className="ai-chat__status" role="status">
            Previewing this change. It is not saved yet.
          </p>
        ) : null}
        {error ? (
          <p className="ai-chat__error" role="alert">
            {error}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {pending ? (
        <div className="ai-review" role="group" aria-label="Review AI change">
          <p className="ai-review__note">Preview only until you accept.</p>
          <div className="ai-review__actions">
            <button
              type="button"
              className="ai-review__accept"
              onClick={onAccept}
              disabled={busy}
            >
              Accept
            </button>
            <button
              type="button"
              className="ai-review__reject"
              onClick={onReject}
              disabled={busy}
            >
              Reject
            </button>
          </div>
        </div>
      ) : null}

      <form className="ai-chat__composer" onSubmit={submit}>
        <label className="ai-sr" htmlFor={inputId}>
          Change request
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          className="ai-chat__input"
          rows={2}
          maxLength={LIMITS.maxUserMessageChars}
          placeholder={
            pending ? 'Accept or reject this preview first' : inputPlaceholder(selection.tag)
          }
          value={draft}
          disabled={composerLocked}
          aria-describedby={countId}
          onChange={(event) => onDraft(event.target.value.slice(0, LIMITS.maxUserMessageChars))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (!pending) onSend()
            }
          }}
        />
        <button
          type="submit"
          className={`ai-chat__send ${busy ? 'is-busy' : ''}`}
          disabled={composerLocked || !draft.trim() || draft.length > LIMITS.maxUserMessageChars}
          aria-label={busy ? 'Sending' : pending ? 'Send disabled until you review' : 'Send'}
        >
          {busy ? 'Sending' : 'Send'}
        </button>
      </form>
      <div className="ai-chat__meta">
        <p className="ai-chat__keys">
          {pending
            ? 'Ctrl/Cmd+Enter accepts · Escape discards'
            : scope === 'page'
              ? 'Enter to send · Shift+Enter for a new line · Esc closes'
              : 'Enter to send · Shift+Enter for a new line · Esc exits select mode'}
        </p>
        <p
          id={countId}
          className={`ai-chat__count ${atLimit ? 'is-limit' : ''}`}
          title={`Max ${LIMITS.maxUserMessageChars} characters`}
        >
          {count}/{LIMITS.maxUserMessageChars}
        </p>
      </div>
    </div>
  )
}
