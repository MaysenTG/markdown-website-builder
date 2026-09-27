import { nextSourceFromAiResponse } from './protocol'
import type { AiEditResponse } from './types'

/** A validated AI edit shown in the preview, not yet written into the draft. */
export interface PendingProposal {
  /** Editor source the model was given. */
  base: string
  /** Document the live preview shows until Accept or Reject. */
  proposed: string
}

export type StageResult =
  | { status: 'pending'; committed: string; proposal: PendingProposal }
  | { status: 'unchanged'; committed: string }
  | { status: 'invalid'; committed: string; error: string }

/**
 * Turn a model response into a preview.
 * The committed draft is always returned unchanged.
 */
export function stageAiResponse(committed: string, response: AiEditResponse): StageResult {
  const applied = nextSourceFromAiResponse(committed, response)
  if (!applied.ok) return { status: 'invalid', committed, error: applied.error }
  if (!applied.changed) return { status: 'unchanged', committed }
  return {
    status: 'pending',
    committed,
    proposal: { base: committed, proposed: applied.source },
  }
}

/** Preview the proposal only while the draft is still the document it was based on. */
export function previewDocument(committed: string, proposal: PendingProposal | null): string {
  if (!proposal || proposal.base !== committed) return committed
  return proposal.proposed
}

/** Accept writes the proposal only when the draft still matches the previewed base. */
export function sourceAfterAccept(committed: string, proposal: PendingProposal): string {
  if (committed !== proposal.base) return committed
  return proposal.proposed
}

/** Reject restores the document from before the proposal. */
export function sourceAfterReject(_committed: string, proposal: PendingProposal): string {
  return proposal.base
}

/** Another instruction waits until the pending preview is accepted or rejected. */
export function sendBlockedByProposal(proposal: PendingProposal | null): boolean {
  return proposal !== null
}
