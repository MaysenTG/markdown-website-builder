import type { ElementSelection } from './types'

const INLINE = new Set([
  'STRONG',
  'EM',
  'B',
  'I',
  'SPAN',
  'S',
  'U',
  'MARK',
  'SMALL',
  'SUB',
  'SUP',
  'BR',
  'WBR',
  'ABBR',
  'CITE',
  'Q',
  'DEL',
  'INS',
  'KBD',
  'SAMP',
  'VAR',
])

const LABELS: Record<string, string> = {
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  p: 'Paragraph',
  li: 'List item',
  ul: 'List',
  ol: 'Numbered list',
  blockquote: 'Quote',
  pre: 'Code block',
  code: 'Code',
  img: 'Image',
  a: 'Link',
  table: 'Table',
  thead: 'Table head',
  tbody: 'Table body',
  tr: 'Table row',
  td: 'Table cell',
  th: 'Table header cell',
  hr: 'Divider',
  figure: 'Figure',
  figcaption: 'Caption',
}

function collapse(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return flat.slice(0, max).trimEnd()
}

function ordinal(index: number): string {
  const value = index + 1
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  switch (value % 10) {
    case 1:
      return `${value}st`
    case 2:
      return `${value}nd`
    case 3:
      return `${value}rd`
    default:
      return `${value}th`
  }
}

export function friendlyLabel(tag: string): string {
  return LABELS[tag] ?? tag
}

function excerptFor(el: Element): string {
  if (el.tagName === 'IMG') {
    const alt = el.getAttribute('alt')?.trim()
    const src = el.getAttribute('src')?.trim()
    return collapse(alt || src || 'Image', 160)
  }
  return collapse(el.textContent ?? '', 160)
}

function pushHeading(stack: { level: number; text: string }[], heading: Element) {
  const level = Number(heading.tagName.slice(1))
  while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop()
  stack.push({ level, text: collapse(heading.textContent ?? '', 80) })
}

export function headingPathFor(el: Element, root: Element): string[] {
  const headings = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')]
  const stack: { level: number; text: string }[] = []
  for (const heading of headings) {
    if (heading === el || heading.contains(el)) {
      pushHeading(stack, heading)
      break
    }
    const position = heading.compareDocumentPosition(el)
    const elementFollows = (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    if (!elementFollows) break
    pushHeading(stack, heading)
  }
  return stack.map((item) => item.text).filter(Boolean)
}

/** Prefer a block the user can name, instead of an inline wrapper like strong or em. */
export function pickSelectable(target: Element, root: Element): HTMLElement | null {
  if (target === root || !root.contains(target)) return null
  let current: Element | null = target
  if (current.tagName === 'CODE' && current.parentElement?.tagName === 'PRE') {
    current = current.parentElement
  }
  while (current && current !== root && INLINE.has(current.tagName)) {
    current = current.parentElement
  }
  if (!current || current === root || !root.contains(current)) return null
  if (!(current instanceof HTMLElement)) return null
  return current
}

export function describeSelection(el: HTMLElement, root: Element): ElementSelection {
  const tag = el.tagName.toLowerCase()
  const label = friendlyLabel(tag)
  const textExcerpt = excerptFor(el)
  const headingPath = headingPathFor(el, root)
  let index = 0
  try {
    index = Math.max(0, [...root.querySelectorAll(tag)].indexOf(el))
  } catch {
    index = 0
  }

  const pathWithoutSelf = el.matches('h1, h2, h3, h4, h5, h6') ? headingPath.slice(0, -1) : headingPath
  const parent = pathWithoutSelf[pathWithoutSelf.length - 1]
  const parts = [`${ordinal(index)} ${tag} in the page`]
  if (textExcerpt) parts.push(`“${collapse(textExcerpt, 80)}”`)
  if (parent) parts.push(`under “${collapse(parent, 80)}”`)

  return {
    tag,
    label,
    textExcerpt,
    headingPath,
    index,
    positionHint: parts.join(' · ').slice(0, 500),
  }
}

export function findSelectedElement(
  root: ParentNode,
  selection: Pick<ElementSelection, 'tag' | 'index' | 'textExcerpt'>,
): HTMLElement | null {
  let nodes: Element[]
  try {
    nodes = [...root.querySelectorAll(selection.tag)]
  } catch {
    return null
  }
  const atIndex = nodes[selection.index]
  if (atIndex instanceof HTMLElement) return atIndex
  const needle = selection.textExcerpt.slice(0, 40)
  if (!needle) return null
  const match = nodes.find((node) => (node.textContent ?? '').includes(needle))
  return match instanceof HTMLElement ? match : null
}

export function selectionTitle(selection: ElementSelection): string {
  const snippet = collapse(selection.textExcerpt, 42)
  return snippet ? `${selection.label} · “${snippet}”` : selection.label
}

export function inputPlaceholder(tag: string): string {
  if (/^h[1-6]$/.test(tag)) return 'Rewrite this heading…'
  if (tag === 'img') return 'Describe a different image…'
  if (tag === 'a') return 'Change this link…'
  if (tag === 'li' || tag === 'ul' || tag === 'ol') return 'Change this list…'
  return 'Describe a change…'
}
