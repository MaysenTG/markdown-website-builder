import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** GitHub Pages serves 404.html for unknown paths so /edit and /v load the SPA shell. */
function ghPagesSpaFallback(): Plugin {
  return {
    name: 'gh-pages-spa-fallback',
    closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist')
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages project site: https://maysentg.github.io/md-url-pages/
  base: '/md-url-pages/',
  plugins: [react(), ghPagesSpaFallback()],
})
