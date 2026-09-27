import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AiPreviewStage } from '../components/ai/AiPreviewStage'
import { PageView } from '../components/PageView'
import { aiEditingEnabled } from '../lib/ai/config'
import { buildShareUrl, encodePagePayload, readPayloadFromLocation } from '../lib/encode'
import { DEFAULT_EDITOR_DRAFT } from '../lib/examples'
import { parsePageSource, updateFrontmatter } from '../lib/parsePage'
import type { PageTheme } from '../lib/types'
import './Editor.css'

type ToastKind = 'info' | 'success' | 'error'

const STORAGE_KEY = 'md-url-pages-draft'

function loadDraft(): string {
  const fromUrl = readPayloadFromLocation()
  if (fromUrl) return fromUrl

  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return DEFAULT_EDITOR_DRAFT
}

function CrosshairIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M7 1.15v2.15M7 10.7v2.15M1.15 7h2.15M10.7 7h2.15"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Editor() {
  const [source, setSource] = useState(loadDraft)
  const [previewSource, setPreviewSource] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [toast, setToast] = useState<{ id: number; kind: ToastKind; text: string } | null>(null)
  const toastId = useRef(0)
  const aiEnabled = aiEditingEnabled()

  const parsed = useMemo(() => parsePageSource(source), [source])
  const previewParsed = useMemo(
    () => parsePageSource(previewSource ?? source),
    [previewSource, source],
  )
  const { frontmatter } = parsed

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, source)
    } catch {
      /* ignore */
    }
  }, [source])

  const shareUrl = useMemo(
    () => buildShareUrl(encodePagePayload(source)),
    [source],
  )

  const showToast = useCallback((kind: ToastKind, text: string) => {
    toastId.current += 1
    setToast({ id: toastId.current, kind, text })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current))
    }, 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const exitSelectMode = useCallback(() => setSelectMode(false), [])

  const toggleSelect = () => {
    if (!aiEnabled) {
      showToast(
        'info',
        'AI editing is off. Set VITE_AI_PROXY_URL and deploy the Cloudflare Worker — see the README.',
      )
      return
    }
    setSelectMode((on) => !on)
  }

  const editSource = useCallback((next: string) => {
    setPreviewSource(null)
    setSource(next)
  }, [])

  const patchFrontmatter = useCallback(
    (patch: Parameters<typeof updateFrontmatter>[1]) => {
      setPreviewSource(null)
      setSource((prev) => updateFrontmatter(prev, patch))
    },
    [],
  )

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyStatus('Copied!')
      setTimeout(() => setCopyStatus(null), 2000)
    } catch {
      setCopyStatus('Copy failed')
    }
  }

  return (
    <div className="editor">
      <header className="editor__bar">
        <Link to="/" className="editor__brand">
          Markdown website builder
        </Link>
        <div className="editor__bar-actions">
          <button
            type="button"
            className="editor__btn editor__btn--select"
            aria-pressed={selectMode}
            aria-disabled={!aiEnabled}
            title={
              aiEnabled
                ? 'Select an element in the preview to edit it with AI'
                : 'AI editing is not configured. See the README.'
            }
            onClick={toggleSelect}
          >
            <CrosshairIcon />
            {selectMode ? 'Selecting' : 'Select'}
          </button>
          <button type="button" className="editor__btn" onClick={copyLink}>
            {copyStatus ?? 'Copy share link'}
          </button>
          <a
            className="editor__btn editor__btn--primary"
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open preview
          </a>
        </div>
      </header>

      <div className="editor__layout">
        <section className="editor__panel editor__panel--write">
          <div className="editor__controls">
            <label>
              Title
              <input
                type="text"
                value={frontmatter.title ?? ''}
                onChange={(e) => patchFrontmatter({ title: e.target.value || undefined })}
              />
            </label>
            <label>
              Theme
              <select
                value={frontmatter.theme ?? 'auto'}
                onChange={(e) =>
                  patchFrontmatter({ theme: e.target.value as PageTheme })
                }
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Max width
              <input
                type="text"
                placeholder="720px"
                value={frontmatter.maxWidth ?? ''}
                onChange={(e) => patchFrontmatter({ maxWidth: e.target.value || undefined })}
              />
            </label>
            <label>
              Font
              <input
                type="text"
                placeholder="system-ui, sans-serif"
                value={frontmatter.font ?? ''}
                onChange={(e) => patchFrontmatter({ font: e.target.value || undefined })}
              />
            </label>
            <label>
              Background
              <input
                type="text"
                placeholder="#0f1117 or gradient…"
                value={frontmatter.background ?? ''}
                onChange={(e) =>
                  patchFrontmatter({ background: e.target.value || undefined })
                }
              />
            </label>
            <label>
              Accent
              <input
                type="text"
                placeholder="#7c9cff"
                value={frontmatter.accent ?? ''}
                onChange={(e) => patchFrontmatter({ accent: e.target.value || undefined })}
              />
            </label>
            <label className="editor__check">
              <input
                type="checkbox"
                checked={frontmatter.hideChrome === true}
                onChange={(e) => patchFrontmatter({ hideChrome: e.target.checked || undefined })}
              />
              Hide header chrome
            </label>
            <label className="editor__full">
              Custom CSS
              <textarea
                rows={4}
                placeholder=".page-body h1 { … }"
                value={frontmatter.css ?? ''}
                onChange={(e) => patchFrontmatter({ css: e.target.value || undefined })}
              />
            </label>
          </div>

          <label className="editor__markdown-label">
            Markdown + frontmatter
            <textarea
              className="editor__markdown"
              value={source}
              onChange={(e) => editSource(e.target.value)}
              spellCheck={false}
            />
          </label>
        </section>

        <section
          className={`editor__panel editor__panel--preview${previewSource ? ' is-ai-pending' : ''}`}
        >
          <div className="editor__preview-head">
            <p className="editor__preview-label">Live preview</p>
            {previewSource ? (
              <p className="editor__select-hint editor__select-hint--pending">
                <span className="editor__select-hint-dot" aria-hidden="true" />
                AI preview · Escape discards
              </p>
            ) : selectMode ? (
              <p className="editor__select-hint">
                <span className="editor__select-hint-dot" aria-hidden="true" />
                Click an element · Esc exits
              </p>
            ) : null}
          </div>
          <AiPreviewStage
            source={source}
            selectMode={selectMode && aiEnabled}
            onApply={setSource}
            onPreview={setPreviewSource}
            onExitSelectMode={exitSelectMode}
            onNotify={showToast}
          >
            <PageView
              frontmatter={previewParsed.frontmatter}
              body={previewParsed.body}
              showChrome={false}
              showFooter={false}
            />
          </AiPreviewStage>
        </section>
      </div>
      {toast ? (
        <button
          type="button"
          className={`ai-toast ai-toast--${toast.kind}`}
          role="status"
          onClick={() => setToast(null)}
        >
          {toast.text}
        </button>
      ) : null}
    </div>
  )
}
