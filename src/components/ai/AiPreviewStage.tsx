import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { requestAiEdit } from '../../lib/ai/client'
import {
  describeSelection,
  findSelectedElement,
  pickSelectable,
} from '../../lib/ai/describeSelection'
import { placePanel, type Box } from '../../lib/ai/placePanel'
import { AiEditError, nextSourceFromAiResponse } from '../../lib/ai/protocol'
import type { AiChatMessage, ElementSelection } from '../../lib/ai/types'
import { AiChatPanel } from './AiChatPanel'
import './AiPreviewStage.css'

type Phase = 'idle' | 'thinking' | 'applying' | 'error'
type ToastKind = 'info' | 'success' | 'error'

interface Session {
  id: number
  selection: ElementSelection
  messages: AiChatMessage[]
}

interface HoverState {
  el: HTMLElement
  tag: string
  box: Box
}

interface AiPreviewStageProps {
  source: string
  selectMode: boolean
  onApply: (next: string) => void
  onExitSelectMode: () => void
  onNotify: (kind: ToastKind, text: string) => void
  children: ReactNode
}

function OverlayBox({ box, tag, selected }: { box: Box; tag: string; selected?: boolean }) {
  const tagInside = box.top < 18
  return (
    <div
      className={`ai-box ${selected ? 'ai-box--selected' : 'ai-box--hover'} ${tagInside ? 'ai-box--tag-inside' : ''}`}
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      aria-hidden="true"
    >
      <span className="ai-box__tag">{tag}</span>
    </div>
  )
}

export function AiPreviewStage({
  source,
  selectMode,
  onApply,
  onExitSelectMode,
  onNotify,
  children,
}: AiPreviewStageProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const selectedElRef = useRef<HTMLElement | null>(null)
  const hoverElRef = useRef<HTMLElement | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const sourceRef = useRef(source)
  const requestGen = useRef(0)
  const busyRef = useRef(false)
  const phaseTimer = useRef<number | null>(null)

  const [session, setSession] = useState<Session | null>(null)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null)
  const [selectBox, setSelectBox] = useState<Box | null>(null)
  const [panelPos, setPanelPos] = useState({ top: 12, left: 12 })
  const [panelMax, setPanelMax] = useState(420)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [flash, setFlash] = useState(false)
  const [seenSelectMode, setSeenSelectMode] = useState(selectMode)

  if (selectMode !== seenSelectMode) {
    setSeenSelectMode(selectMode)
    if (!selectMode) {
      setSession(null)
      setHover(null)
      setSelectedEl(null)
      setSelectBox(null)
      setPhase('idle')
      setError(null)
      setDraft('')
      setFlash(false)
    }
  }

  const clearPhaseTimer = useCallback(() => {
    if (phaseTimer.current !== null) {
      window.clearTimeout(phaseTimer.current)
      phaseTimer.current = null
    }
  }, [])

  const measure = useCallback((el: HTMLElement): Box | null => {
    const shell = shellRef.current
    if (!shell) return null
    const shellRect = shell.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    return {
      top: rect.top - shellRect.top,
      left: rect.left - shellRect.left,
      width: Math.max(rect.width, 4),
      height: Math.max(rect.height, 4),
    }
  }, [])

  useEffect(() => {
    sessionRef.current = session
    sourceRef.current = source
    selectedElRef.current = selectedEl
    hoverElRef.current = hover?.el ?? null
  }, [session, source, selectedEl, hover])

  useEffect(() => {
    if (selectMode) return
    requestGen.current += 1
    busyRef.current = false
    clearPhaseTimer()
    selectedElRef.current = null
    hoverElRef.current = null
  }, [selectMode, clearPhaseTimer])

  useEffect(() => {
    if (!selectMode) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onExitSelectMode()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectMode, onExitSelectMode])

  useEffect(() => {
    return () => clearPhaseTimer()
  }, [clearPhaseTimer])

  useEffect(() => {
    if (!selectMode) return
    const scroll = scrollRef.current
    if (!scroll) return
    const sync = () => {
      const hovered = hoverElRef.current
      if (hovered?.isConnected) {
        const box = measure(hovered)
        if (box) {
          setHover((current) => (current && current.el === hovered ? { ...current, box } : current))
        }
      }
      const selected = selectedElRef.current
      if (selected?.isConnected) {
        const box = measure(selected)
        if (box) setSelectBox(box)
      }
    }
    scroll.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      scroll.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [selectMode, measure])

  useLayoutEffect(() => {
    if (!selectMode) return
    const root = scrollRef.current?.querySelector('.page-body')
    const current = sessionRef.current
    if (!root || !current) return
    const previous = selectedElRef.current
    const el =
      previous && previous.isConnected && root.contains(previous)
        ? previous
        : findSelectedElement(root, current.selection)
    if (!(el instanceof HTMLElement)) return
    selectedElRef.current = el
    setSelectedEl(el)
    const next = describeSelection(el, root)
    const box = measure(el)
    if (box) setSelectBox(box)
    setSession((existing) => {
      if (!existing || existing.id !== current.id) return existing
      const same =
        existing.selection.tag === next.tag &&
        existing.selection.index === next.index &&
        existing.selection.textExcerpt === next.textExcerpt &&
        existing.selection.positionHint === next.positionHint &&
        existing.selection.label === next.label
      return same ? existing : { ...existing, selection: next }
    })
  }, [source, selectMode, session?.id, measure])

  useLayoutEffect(() => {
    const shell = shellRef.current
    const panel = panelRef.current
    if (!shell || !panel || !selectBox || !session) return
    const cap = Math.min(420, Math.max(180, shell.clientHeight - 16))
    setPanelMax((prev) => (prev === cap ? prev : cap))
    const next = placePanel(
      selectBox,
      { width: shell.clientWidth, height: shell.clientHeight },
      { width: panel.offsetWidth, height: panel.offsetHeight },
    )
    setPanelPos((prev) => (prev.top === next.top && prev.left === next.left ? prev : next))
  }, [selectBox, session, phase, error, panelMax])

  const closePanel = () => {
    clearPhaseTimer()
    setSession(null)
    setSelectBox(null)
    setSelectedEl(null)
    selectedElRef.current = null
    setPhase('idle')
    setError(null)
    setDraft('')
    setFlash(false)
  }

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!selectMode) return
    const root = event.currentTarget.querySelector('.page-body')
    if (!root || !(event.target instanceof Element)) return
    const picked = pickSelectable(event.target, root)
    if (picked === hoverElRef.current) return
    hoverElRef.current = picked
    if (!picked) {
      setHover(null)
      return
    }
    const box = measure(picked)
    if (!box) return
    setHover({ el: picked, tag: picked.tagName.toLowerCase(), box })
  }

  const onMouseLeave = () => {
    hoverElRef.current = null
    setHover(null)
  }

  const selectElement = (event: MouseEvent<HTMLDivElement>) => {
    if (!selectMode) return
    const root = event.currentTarget.querySelector('.page-body')
    if (!root || !(event.target instanceof Element)) return
    const picked = pickSelectable(event.target, root)
    if (!picked) return
    event.preventDefault()
    event.stopPropagation()
    const described = describeSelection(picked, root)
    const box = measure(picked)
    if (!box) return
    const previous = sessionRef.current
    const same =
      previous &&
      previous.selection.tag === described.tag &&
      previous.selection.index === described.index
    if (!same) {
      requestGen.current += 1
      busyRef.current = false
      clearPhaseTimer()
      setPhase('idle')
      setError(null)
      setDraft('')
      setFlash(false)
    }
    selectedElRef.current = picked
    setSelectedEl(picked)
    setSelectBox(box)
    setSession((existing) => {
      if (
        existing &&
        existing.selection.tag === described.tag &&
        existing.selection.index === described.index
      ) {
        return { ...existing, selection: described }
      }
      return { id: (existing?.id ?? 0) + 1, selection: described, messages: [] }
    })
  }

  const guardPreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!selectMode) return
    const root = event.currentTarget.querySelector('.page-body')
    if (!root || !(event.target instanceof Element)) return
    if (pickSelectable(event.target, root)) event.preventDefault()
  }

  const send = async () => {
    const current = sessionRef.current
    if (!current || busyRef.current) return
    const instruction = draft.trim()
    if (!instruction) return

    const sessionId = current.id
    const history = current.messages
    const optimistic: AiChatMessage[] = [...history, { role: 'user', content: instruction }]
    const sourceAtSend = sourceRef.current
    const gen = ++requestGen.current
    busyRef.current = true
    clearPhaseTimer()
    setSession({ ...current, messages: optimistic })
    setDraft('')
    setPhase('thinking')
    setError(null)

    try {
      const response = await requestAiEdit({
        document: sourceAtSend,
        selection: current.selection,
        messages: optimistic,
      })
      if (requestGen.current !== gen) return
      if (sourceRef.current !== sourceAtSend) {
        setSession((existing) => (existing && existing.id === sessionId ? { ...existing, messages: history } : existing))
        setDraft((existing) => (existing.trim() ? existing : instruction))
        setPhase('error')
        setError('The page changed while the AI was working, so that edit was not applied.')
        return
      }

      const applied = nextSourceFromAiResponse(sourceAtSend, response)
      if (!applied.ok) {
        setSession((existing) => (existing && existing.id === sessionId ? { ...existing, messages: history } : existing))
        setDraft((existing) => (existing.trim() ? existing : instruction))
        setPhase('error')
        setError(applied.error)
        onNotify('error', applied.error)
        return
      }

      if (applied.changed) onApply(applied.source)
      setSession((existing) => {
        if (!existing || existing.id !== sessionId) return existing
        return {
          ...existing,
          messages: [...optimistic, { role: 'assistant', content: response.message }],
        }
      })
      setPhase('applying')
      setFlash(true)
      if (applied.changed) onNotify('success', 'Preview updated')
      phaseTimer.current = window.setTimeout(() => {
        setPhase('idle')
        setFlash(false)
        phaseTimer.current = null
      }, 900)
    } catch (err) {
      if (requestGen.current !== gen) return
      const message = err instanceof AiEditError ? err.message : 'The AI request failed.'
      setSession((existing) => (existing && existing.id === sessionId ? { ...existing, messages: history } : existing))
      setDraft((existing) => (existing.trim() ? existing : instruction))
      setPhase('error')
      setError(message)
      onNotify('error', message)
    } finally {
      if (requestGen.current === gen) busyRef.current = false
    }
  }

  return (
    <div
      className={`ai-stage ${flash ? 'ai-stage--flash' : ''}`}
      ref={shellRef}
      data-selecting={selectMode ? 'true' : 'false'}
    >
      <div
        className="ai-stage__scroll"
        ref={scrollRef}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseDown={guardPreviewClick}
        onClick={selectElement}
        onAuxClick={guardPreviewClick}
      >
        {children}
      </div>
      {selectMode ? (
        <div className="ai-stage__overlay">
          {hover && hover.el !== selectedEl ? (
            <OverlayBox box={hover.box} tag={hover.tag} />
          ) : null}
          {session && selectBox ? <OverlayBox box={selectBox} tag={session.selection.tag} selected /> : null}
          {session && selectBox ? (
            <div
              ref={panelRef}
              className="ai-chat-anchor"
              style={
                {
                  top: panelPos.top,
                  left: panelPos.left,
                  '--ai-panel-max': `${panelMax}px`,
                } as CSSProperties
              }
            >
              <AiChatPanel
                selection={session.selection}
                sessionId={session.id}
                messages={session.messages}
                phase={phase}
                error={error}
                draft={draft}
                onDraft={setDraft}
                onSend={() => {
                  void send()
                }}
                onClose={closePanel}
              />
            </div>
          ) : null}
          {flash ? <div className="ai-apply-flash" /> : null}
          {!session ? (
            <p className="ai-sr">
              Select mode is on. Click an element in the preview to describe a change. Press Escape to exit.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
