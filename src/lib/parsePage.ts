import { dump, load } from 'js-yaml'
import type { PageFrontmatter, ParsedPage } from './types'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parsePageSource(raw: string): ParsedPage {
  const trimmed = raw.trim()
  const match = trimmed.match(FRONTMATTER_RE)
  if (!match) {
    return { frontmatter: {}, body: trimmed, raw: trimmed }
  }

  let frontmatter: PageFrontmatter = {}
  try {
    const parsed = load(match[1])
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed as PageFrontmatter
    }
  } catch {
    frontmatter = {}
  }

  return {
    frontmatter,
    body: match[2].trimStart(),
    raw: trimmed,
  }
}

export function serializePage(frontmatter: PageFrontmatter, body: string): string {
  const keys = Object.keys(frontmatter).filter((k) => {
    const v = frontmatter[k as keyof PageFrontmatter]
    return v !== undefined && v !== '' && v !== false
  })
  if (keys.length === 0) {
    return body
  }
  const yamlBlock = dump(frontmatter, { lineWidth: 120, noRefs: true }).trimEnd()
  return `---\n${yamlBlock}\n---\n\n${body}`
}

export function updateFrontmatter(raw: string, patch: Partial<PageFrontmatter>): string {
  const parsed = parsePageSource(raw)
  const next: PageFrontmatter = { ...parsed.frontmatter, ...patch }
  for (const key of Object.keys(next) as (keyof PageFrontmatter)[]) {
    if (next[key] === undefined || next[key] === '') {
      delete next[key]
    }
  }
  return serializePage(next, parsed.body)
}
