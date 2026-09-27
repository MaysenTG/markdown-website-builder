# Markdown website builder

Pages rendered from markdown (plus optional YAML frontmatter) stored in the URL. No accounts — share a link and the page appears with your chosen layout and styling. The shared page itself needs no backend. The static site is deployed to Cloudflare Pages. Optional AI editing on `/edit` calls a Cloudflare Worker you deploy separately.

Repository: [MaysenTG/markdown-website-builder](https://github.com/MaysenTG/markdown-website-builder)

## Live site

Production is a Cloudflare Pages project, served at the root of the hostname (Vite `base: '/'`). With the default project name from the deploy workflow, that is:

https://markdown-website-builder.pages.dev/

If that name is already taken, set the Actions variable `CLOUDFLARE_PAGES_PROJECT` to another name. The site then lives at `https://<project-name>.pages.dev/`. Preview deployments use `https://<id>.<project-name>.pages.dev/`. A custom domain is whatever you attach in the Pages project.

GitHub Pages is retired. `https://maysentg.github.io/markdown-website-builder/` will stop updating, and it will keep serving an old copy until you turn the site off: GitHub → Settings → Pages → Source → None.

Local dev is the same root path. After `npm run dev`, open `http://localhost:5173/` and `http://localhost:5173/edit`.

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
| `/edit` | **Editor** — write markdown, tune frontmatter, copy a share link. Optional AI select-and-chat when a Worker URL is configured. |

With no valid payload, `/` shows a short landing page with links to the editor and two example pages.

## URL encoding

1. The document is plain text: optional YAML frontmatter between `---` lines, then markdown body.
2. The full string is compressed with [lz-string](https://github.com/pieroxy/lz-string) (`compressToEncodedURIComponent`).
3. The result is placed in the **hash** (preferred): `https://markdown-website-builder.pages.dev/#p=<compressed>`  
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
| `css` | Extra CSS injected into the page (targets `.page-body`, `.viewer-site-footer`, etc.) |

The viewer always shows a small site footer (About, Editor, GitHub). There is no toggle in the editor; to hide it on a shared page, use frontmatter `css`, e.g. `.viewer-site-footer { display: none; }`.

## AI editing

On `/edit`, **Select** turns on a DevTools-style picker over the live preview. Hover outlines an element; click opens a small chat next to it. The assistant rewrites the page’s markdown and YAML frontmatter (the same source the editor already stores), and the preview updates. The draft still goes to localStorage. Escape leaves select mode.

If `VITE_AI_PROXY_URL` is empty, Select stays in the toolbar but does not call anything. Clicking it explains that AI is off and points here. The rest of the editor works as before.

The browser never sees an OpenAI API key. It only talks to your Worker.

**Request flow.** The editor sends the current document, a description of the element you clicked (tag, text excerpt, heading path, position), and the chat transcript to `POST VITE_AI_PROXY_URL`. The Worker checks the browser `Origin`, an optional gate token, a body-size cap, and a best-effort per-IP rate limit, then calls OpenAI Chat Completions with `OPENAI_API_KEY`. The model must return the **complete** updated document. The editor replaces its source with that document after checking that the frontmatter still parses and that the edit did not add a script tag.

Wire shape:

```json
{
  "document": "---\ntitle: Notes\n---\n\n# Notes\n",
  "selection": {
    "tag": "h2",
    "label": "Heading 2",
    "textExcerpt": "Morning light",
    "headingPath": ["Field Notes", "Morning light"],
    "positionHint": "1st h2 in the page · “Morning light”",
    "index": 0
  },
  "messages": [{ "role": "user", "content": "Make this heading shorter" }]
}
```

Success is `{ "document": "<full source>", "message": "<short explanation>" }`. Errors are `{ "error": "<plain language>" }` with an HTTP error status. Send `Content-Type: application/json`. If you set a gate, also send `X-AI-Gate`.

The default model is `gpt-4o-mini`. To change it, edit `OPENAI_MODEL` in `worker/wrangler.toml` and redeploy. Use a Chat Completions model that supports structured outputs (`response_format.type` of `json_schema`); `gpt-4o-mini` and `gpt-4o` do. The browser cannot pick the model. Optional `OPENAI_BASE_URL` in that file overrides the API root (default `https://api.openai.com/v1`).

### 1. Deploy the Worker

From the repo root, with a Cloudflare account:

```bash
cd worker
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

`wrangler deploy` prints the workers.dev URL. You can attach a custom domain later in the Cloudflare dashboard. CORS cares about the **site** origin (your `*.pages.dev` host or custom domain), not the Worker host.

Change `name` in `worker/wrangler.toml` if that script name is already used on your account. Redeploying does not clear secrets already stored on the Worker.

Optional gate (recommended once the site is public):

```bash
npx wrangler secret put GATE_TOKEN
```

Leave `ALLOWED_ORIGINS` unset to allow every `https://*.pages.dev` host (production and preview deployments) plus local Vite (`http://localhost:5173`, `http://127.0.0.1:5173`, and the `4173` preview ports). A pattern may contain one `*` for a hostname label prefix, for example `https://*.pages.dev`.

That wildcard lets **any** Cloudflare Pages site call your Worker from a browser. To narrow it, set `ALLOWED_ORIGINS` to your real origins. The `*` form does not match the apex host, so list both the production host and the preview wildcard:

```
https://markdown-website-builder.pages.dev,https://*.markdown-website-builder.pages.dev,https://example.com
```

Replace `example.com` with a custom domain when you have one. If you set `ALLOWED_ORIGINS`, it **replaces** the defaults, so include localhost too when you develop locally. A non-default Vite port has to be listed.

### 2. Point the app at the Worker

Create `.env.local` in the repo root (it is gitignored):

```bash
VITE_AI_PROXY_URL=http://127.0.0.1:8787
# Only if you set GATE_TOKEN on the Worker:
# VITE_AI_GATE_TOKEN=the-same-value
```

Restart `npm run dev` after changing env files. Vite inlines `VITE_*` at startup and at production build time. Open `http://localhost:5173/edit`.

For Cloudflare Pages, set the same names as build-time variables, then redeploy. With the GitHub Actions workflow below, add them as repository **variables** (Settings → Secrets and variables → Actions → Variables). If you use the dashboard Git connection instead, set them on the Pages project (Settings → Environment variables) for Production and Preview.

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_AI_PROXY_URL` | no | Public Worker URL, for example `https://markdown-website-builder-ai.<account>.workers.dev`. Empty or unset keeps AI off. |
| `VITE_AI_GATE_TOKEN` | no | Same value as `GATE_TOKEN`. It is compiled into the public JavaScript bundle. |

Do **not** put `OPENAI_API_KEY` on the Pages build or in GitHub. The key stays a Worker secret.

### 3. Local Worker

In one terminal:

```bash
cd worker
cp .dev.vars.example .dev.vars
# edit .dev.vars and set OPENAI_API_KEY
npx wrangler dev
```

`.dev.vars` is gitignored. Wrangler serves `http://127.0.0.1:8787`. In another terminal, set `VITE_AI_PROXY_URL` as above and run `npm run dev`.

`GET` the Worker URL to see `{ "ok": true }`. It does not call OpenAI. `POST` from the editor does.

### 4. Deploy the site to Cloudflare Pages

The site is a static Vite build (`npm run build`, output directory `dist`). `public/_redirects` contains `/* /index.html 200` so `/edit` and `/v` load the SPA. Deep links do not depend on a copied `404.html`.

Use one deploy path, not both.

**GitHub Actions (in this repo).** `.github/workflows/cloudflare-pages.yml` runs on pushes to `main`. It always installs, tests, and builds. It deploys only when these Actions **secrets** are set:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | API token with **Account → Cloudflare Pages → Edit**. Add **Account → Workers Scripts → Edit** on the same token if this workflow and `worker.yml` share it. |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from the Cloudflare dashboard overview. |

Optional Actions **variable** `CLOUDFLARE_PAGES_PROJECT` (default `markdown-website-builder`) is the Pages project name and the `*.pages.dev` subdomain. The workflow runs `wrangler pages project create` before deploy so the first push can create the project (later runs ignore “already exists”). Until the secrets exist, the workflow builds and then skips deploy.

**Dashboard Git connection (instead of the workflow).** In the Cloudflare dashboard: Workers & Pages → Create → Pages → Connect to Git → this repository. Build command `npm run build`, build output directory `dist`. Set `VITE_AI_PROXY_URL` and, if you use a gate, `VITE_AI_GATE_TOKEN` as Pages environment variables. Do not also leave the Actions deploy running.

### 5. Optional Worker deploy from GitHub

`.github/workflows/worker.yml` deploys `worker/` when that directory changes, and when you run it by hand. It skips when `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is missing.

The OpenAI key stays a Worker secret (`wrangler secret put`). It is not a GitHub secret and it is not a Pages build variable. Pushing Worker code with the token and account id set will redeploy; existing Worker secrets remain.

### Security notes for the Worker

Anyone who can call the Worker spends your OpenAI quota.

- The Pages site is public. The default allowlist includes every `https://*.pages.dev` origin, so any Pages site can call the Worker from a browser once the URL is baked into a build. Narrow `ALLOWED_ORIGINS` to your project and custom domain when you can.
- Visitors who can open `/edit` on your site can send edits once `VITE_AI_PROXY_URL` is in the build.
- An origin allowlist stops **other websites** from calling the Worker from a visitor’s browser. It does not stop `curl` with a spoofed `Origin` header.
- `GATE_TOKEN` / `VITE_AI_GATE_TOKEN` blocks clients that do not have the token. On Cloudflare Pages the token is visible in the built JavaScript, so it only slows people down.
- The Worker rate-limits by IP inside each isolate (20 requests per minute). That is best-effort, not a global counter.
- Bodies over 150 KB are rejected. Page source sent to the model is capped at 48,000 characters.
- The Worker does not log the API key or the page text. Do not add logs that print request bodies.
- Set a monthly budget or usage limit on the OpenAI API key. Leave `VITE_AI_PROXY_URL` unset on Pages if you only want AI on your own machine.
- Do not commit `.env`, `.env.local`, `worker/.dev.vars`, or real tokens.

## Security

- **URLs are public.** Anyone with the link can read the content. Do not put secrets in shared pages.
- Markdown is rendered to HTML and sanitized with DOMPurify (no script tags from markdown).
- **`css` in frontmatter is not sandboxed.** A shared link can include CSS that restyles the page or attempts phishing-style UI. Only open links you trust, and treat custom CSS like running untrusted code in the browser context of this origin.
- The editor stores your draft in **localStorage** on this device only.
- AI editing is optional. See [AI editing](#ai-editing) for how the Worker holds the OpenAI key, and for the quota warning if you enable it on the public site.

## Stack

Vite, React, TypeScript, react-router-dom, marked, DOMPurify, js-yaml, lz-string. Hosting: Cloudflare Pages. Optional AI proxy: a Cloudflare Worker in `worker/` (Wrangler).
