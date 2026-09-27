import { useMemo } from 'react'
import type { PageFrontmatter } from '../lib/types'
import { renderMarkdownToHtml } from '../lib/renderMarkdown'
import './PageView.css'

interface PageViewProps {
  frontmatter: PageFrontmatter
  body: string
  showChrome?: boolean
}

function themeClass(theme: PageFrontmatter['theme']): string {
  if (theme === 'dark') return 'theme-dark'
  if (theme === 'light') return 'theme-light'
  return 'theme-auto'
}

export function PageView({ frontmatter, body, showChrome = true }: PageViewProps) {
  const html = useMemo(() => renderMarkdownToHtml(body), [body])
  const hideChrome = frontmatter.hideChrome === true

  const style = {
    '--page-max-width': frontmatter.maxWidth ?? '720px',
    '--page-font': frontmatter.font ?? 'ui-sans-serif, system-ui, sans-serif',
    '--page-bg': frontmatter.background ?? undefined,
    '--page-accent': frontmatter.accent ?? undefined,
  } as React.CSSProperties

  return (
    <div
      className={`page-view ${themeClass(frontmatter.theme)}`}
      style={style}
      data-hide-chrome={hideChrome || !showChrome ? 'true' : 'false'}
    >
      {!hideChrome && showChrome && (
        <header className="page-view__chrome">
          <span className="page-view__title">{frontmatter.title ?? 'Untitled page'}</span>
          <a className="page-view__edit-link" href="/edit">
            Edit
          </a>
        </header>
      )}
      <article className="page-view__article">
        {frontmatter.title && hideChrome && (
          <h1 className="page-view__sr-title">{frontmatter.title}</h1>
        )}
        <div className="page-body" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
      {frontmatter.css ? (
        <style>{frontmatter.css}</style>
      ) : null}
    </div>
  )
}
