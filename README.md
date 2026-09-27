# md-url-pages

Frontend-only pages rendered from markdown (plus optional YAML frontmatter) stored in the URL. No backend, no accounts — share a link and the page appears with your chosen layout and styling.

## Live site

https://maysentg.github.io/md-url-pages/

The app is built with Vite `base: /md-url-pages/` for this GitHub Pages project site. Share links and hash payloads (`#p=…`) use that path on production; local dev uses the same base, so open `http://localhost:5173/md-url-pages/` after `npm run dev`.

## Run locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Routes

| Path | Purpose |
|------|---------|
| `/` or `/v` | **Viewer** — decodes the URL payload and renders the page |
| `/edit` | **Editor** — write markdown, tune frontmatter, copy a share link |

With no valid payload, `/` shows a short landing page with links to the editor and two example pages.

## URL encoding

1. The document is plain text: optional YAML frontmatter between `---` lines, then markdown body.
2. The full string is compressed with [lz-string](https://github.com/pieroxy/lz-string) (`compressToEncodedURIComponent`).
3. The result is placed in the **hash** (preferred): `https://maysentg.github.io/md-url-pages/#p=<compressed>`  
   Query params also work: `?p=<compressed>` or `?d=<compressed>`.

Hash links stay on the client (no server round-trip) and avoid leaking long payloads in referrer headers as often as query strings.

Example shape (before compression):

```yaml
---
title: My page
theme: dark
accent: "#7c9cff"
maxWidth: 680px
css: |
  .page-body h1 { letter-spacing: 0.05em; }
---

# Hello

Your **markdown** here.
```

### Frontmatter knobs

| Field | Effect |
|-------|--------|
| `title` | Document title and header label |
| `theme` | `light`, `dark`, or `auto` |
| `maxWidth` | Content column width (CSS length) |
| `font` | `font-family` for the page |
| `background` | Page background (color, gradient, etc.) |
| `accent` | Link and accent color |
| `hideChrome` | Hide the small viewer header |
| `css` | Extra CSS injected into the page (targets `.page-body`, etc.) |

## Security

- **URLs are public.** Anyone with the link can read the content. Do not put secrets in shared pages.
- Markdown is rendered to HTML and sanitized with DOMPurify (no script tags from markdown).
- **`css` in frontmatter is not sandboxed.** A shared link can include CSS that restyles the page or attempts phishing-style UI. Only open links you trust, and treat custom CSS like running untrusted code in the browser context of this origin.
- The editor stores your draft in **localStorage** on this device only.

## Stack

Vite, React, TypeScript, react-router-dom, marked, DOMPurify, js-yaml, lz-string.
