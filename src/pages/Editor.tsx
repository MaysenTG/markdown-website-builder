import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageView } from '../components/PageView'
import { buildShareUrl, encodePagePayload } from '../lib/encode'
import { DEFAULT_EDITOR_DRAFT } from '../lib/examples'
import { parsePageSource, updateFrontmatter } from '../lib/parsePage'
import type { PageTheme } from '../lib/types'
import './Editor.css'

const STORAGE_KEY = 'md-url-pages-draft'

function loadDraft(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return DEFAULT_EDITOR_DRAFT
}

export function Editor() {
  const [source, setSource] = useState(loadDraft)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const parsed = useMemo(() => parsePageSource(source), [source])
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

  const patchFrontmatter = useCallback(
    (patch: Parameters<typeof updateFrontmatter>[1]) => {
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
          md-url-pages
        </Link>
        <div className="editor__bar-actions">
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
              onChange={(e) => setSource(e.target.value)}
              spellCheck={false}
            />
          </label>
        </section>

        <section className="editor__panel editor__panel--preview">
          <p className="editor__preview-label">Live preview</p>
          <div className="editor__preview-frame">
            <PageView
              frontmatter={parsed.frontmatter}
              body={parsed.body}
              showChrome={false}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
