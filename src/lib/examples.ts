import { encodePagePayload, buildShareUrl } from './encode'

const resumeExample = `---
title: Alex Rivera — Product Engineer
theme: dark
accent: "#7c9cff"
maxWidth: 680px
font: "Georgia, serif"
background: "#0f1117"
hideChrome: true
---

# Alex Rivera

**Product engineer** · shipping readable tools

---

## Now

Building frontend systems that stay small. Previously at places that cared about craft.

## Selected work

- **URL-native docs** — zero backend, full pages in a link
- **Design systems** — tokens, not templates

## Contact

[hello@example.com](mailto:hello@example.com) · [GitHub](https://github.com)
`

const galleryExample = `---
title: Field Notes
theme: light
accent: "#c45d3a"
maxWidth: 900px
font: "ui-sans-serif, system-ui, sans-serif"
css: |
  .page-body h2 { letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.85rem; color: var(--accent); }
  .page-body img { border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
---

# Field Notes · Week 12

A loose gallery in markdown — structure is yours, not a form.

## Morning light

![Placeholder hills](https://picsum.photos/seed/mdurl/800/420)

## Sketches

> Ink first, pixels later.

- Grid studies
- Type scale on a napkin
- One good border-radius

## Closing

Share this link; the **look** rides in the URL with the words.
`

export const EXAMPLE_PAGES = [
  { label: 'Dark resume', source: resumeExample },
  { label: 'Gallery notes', source: galleryExample },
] as const

export function exampleShareLinks(): { label: string; href: string }[] {
  return EXAMPLE_PAGES.map(({ label, source }) => ({
    label,
    href: buildShareUrl(encodePagePayload(source)),
  }))
}

export const DEFAULT_EDITOR_DRAFT = galleryExample
