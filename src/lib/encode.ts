import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

const PAYLOAD_PREFIX = 'p='

/** Encode page source (frontmatter + markdown) for URL hash or query. */
export function encodePagePayload(source: string): string {
  return compressToEncodedURIComponent(source.trim())
}

/** Decode payload from hash or query value; returns null if invalid. */
export function decodePagePayload(encoded: string | null | undefined): string | null {
  if (!encoded) return null
  let value = encoded.trim()
  if (value.startsWith(PAYLOAD_PREFIX)) {
    value = value.slice(PAYLOAD_PREFIX.length)
  }
  if (!value) return null
  try {
    const decoded = decompressFromEncodedURIComponent(value)
    return decoded && decoded.length > 0 ? decoded : null
  } catch {
    return null
  }
}

export function readPayloadFromLocation(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash) {
    const fromHash = decodePagePayload(hash)
    if (fromHash) return fromHash
  }

  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('p') ?? params.get('d')
  return decodePagePayload(fromQuery)
}

export function buildShareUrl(encoded: string, path: '/' | '/v' = '/'): string {
  const basePath = import.meta.env.BASE_URL
  const pathname = path === '/v' ? `${basePath}v` : basePath
  const url = new URL(pathname, window.location.origin)
  url.hash = `${PAYLOAD_PREFIX}${encoded}`
  return url.href
}
