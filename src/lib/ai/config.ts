function clean(value: string | undefined): string {
  return value?.trim() ?? ''
}

/** Worker endpoint. Empty means AI editing is off. */
export function aiProxyUrl(): string | null {
  const raw = clean(import.meta.env.VITE_AI_PROXY_URL)
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

/**
 * Optional shared gate. This value is compiled into the static bundle,
 * so it only slows casual abuse — it is not a secret on GitHub Pages.
 */
export function aiGateToken(): string | null {
  const raw = clean(import.meta.env.VITE_AI_GATE_TOKEN)
  return raw || null
}

export function aiEditingEnabled(): boolean {
  return aiProxyUrl() !== null
}
