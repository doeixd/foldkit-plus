/**
 * The Remote seam: a local Message folds through the full assembly without
 * touching the Remote slice, and Remote Messages never reach the local
 * reducer (its input type excludes them — `tsc` proves that half).
 */
import { describe, expect, it } from 'vitest'
import { Remote } from 'foldkit-remote'
import { App, Message, update } from '../src/stack.js'

const initial = { ...App.initial, notes: [{ id: 'n1', body: 'one' }] }

describe('remote seam', () => {
  it('routes local Messages around the Remote slice', () => {
    const changed = update(initial, Message.SelectedNote({ id: 'n1' }))
    expect(changed.model.selectedNoteId).toBe('n1')
    expect(changed.model.remote).toEqual(Remote.initial)
  })
})
