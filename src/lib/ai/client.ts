import { aiGateToken, aiProxyUrl } from './config'
import { AiEditError, assertAiEditRequest, parseAiEditResponse, trimMessages } from './protocol'
import type { AiEditRequest, AiEditResponse } from './types'

/**
 * Ask the Cloudflare Worker to rewrite the page.
 * The browser never receives or sends an OpenAI API key.
 */
export async function requestAiEdit(request: AiEditRequest): Promise<AiEditResponse> {
  const endpoint = aiProxyUrl()
  if (!endpoint) {
    throw new AiEditError('AI editing is not configured. Set VITE_AI_PROXY_URL. See the README.')
  }

  const payload: AiEditRequest = {
    ...request,
    messages: trimMessages(request.messages),
  }
  assertAiEditRequest(payload)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const gate = aiGateToken()
  if (gate) headers['X-AI-Gate'] = gate

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
  } catch {
    throw new AiEditError('Could not reach the AI proxy. Check VITE_AI_PROXY_URL and that the Worker is running.')
  }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `AI request failed (${response.status}).`
    throw new AiEditError(message, response.status)
  }

  return parseAiEditResponse(body)
}
