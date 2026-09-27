import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Cloudflare Pages serves the site at the root of *.pages.dev or a custom domain.
// SPA paths such as /edit are rewritten to index.html by public/_redirects.
export default defineConfig({
  base: '/',
  plugins: [react()],
})
