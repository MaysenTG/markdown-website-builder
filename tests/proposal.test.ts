import { describe, expect, it } from 'vitest'
import {
  previewDocument,
  sendBlockedByProposal,
  sourceAfterAccept,
  sourceAfterReject,
  stageAiResponse,
} from '../src/lib/ai/proposal'

const base = '---\ntitle: Notes\n---\n\n## Morning light'
const proposed = '---\ntitle: Notes\n---\n\n## Dawn'

describe('AI proposal review', () => {
  it('does not commit the editor source when the model responds', () => {
    const staged = stageAiResponse(base, { document: proposed, message: 'Renamed the heading.' })
    expect(staged.status).toBe('pending')
    expect(staged.committed).toBe(base)
    if (staged.status !== 'pending') return
    expect(staged.proposal).toEqual({ base, proposed })
    expect(previewDocument(base, staged.proposal)).toBe(proposed)
    expect(sendBlockedByProposal(staged.proposal)).toBe(true)
  })

  it('commits the proposed document on accept', () => {
    const staged = stageAiResponse(base, { document: proposed, message: 'Renamed the heading.' })
    if (staged.status !== 'pending') throw new Error('expected a pending proposal')
    expect(sourceAfterAccept(base, staged.proposal)).toBe(proposed)
    expect(previewDocument(proposed, null)).toBe(proposed)
    expect(sendBlockedByProposal(null)).toBe(false)
  })

  it('restores the previous document on reject', () => {
    const staged = stageAiResponse(base, { document: proposed, message: 'Renamed the heading.' })
    if (staged.status !== 'pending') throw new Error('expected a pending proposal')
    expect(sourceAfterReject(base, staged.proposal)).toBe(base)
    expect(previewDocument(base, null)).toBe(base)
    expect(sourceAfterReject(proposed, staged.proposal)).toBe(base)
  })

  it('leaves an unchanged or invalid response unstaged', () => {
    expect(stageAiResponse(base, { document: base, message: 'No edit.' })).toEqual({
      status: 'unchanged',
      committed: base,
    })
    const invalid = stageAiResponse(base, { document: '---\ntitle: [\n---\n\n# Hi\n', message: 'bad' })
    expect(invalid.status).toBe('invalid')
    if (invalid.status === 'invalid') expect(invalid.committed).toBe(base)
  })

  it('does not accept a proposal after the draft has moved on', () => {
    const staged = stageAiResponse(base, { document: proposed, message: 'Renamed the heading.' })
    if (staged.status !== 'pending') throw new Error('expected a pending proposal')
    const typed = `${base}\nA note.\n`
    expect(sourceAfterAccept(typed, staged.proposal)).toBe(typed)
    expect(previewDocument(typed, staged.proposal)).toBe(typed)
  })
})
