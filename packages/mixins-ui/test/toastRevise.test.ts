// @vitest-environment jsdom
/**
 * A payload toast that shows progress: `revise` replaces what an entry holds
 * and nothing else, so the toast keeps its place, its animation and its
 * dismissal timing while the figure moves.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { ToastView } from '../src/index.js'

const Upload = Schema.Struct({ name: Schema.String, percent: Schema.Number })
const uploads = ToastView.make(Upload)

const started = uploads.show(uploads.init({ id: 'uploads' }), {
  payload: { name: 'report.pdf', percent: 10 },
  sticky: true,
}).model
const other = uploads.show(started, {
  payload: { name: 'notes.txt', percent: 90 },
  sticky: true,
}).model
const [first] = started.entries

describe('ToastView.make(...).revise', () => {
  it('replaces the payload of the entry named, keeping the rest of it', () => {
    const entry = other.entries.find(each => each.payload.name === 'report.pdf')!
    const revised = uploads.revise(other, entry.id, { name: 'report.pdf', percent: 60 })
    const after = revised.entries.find(each => each.id === entry.id)!
    expect(after.payload).toEqual({ name: 'report.pdf', percent: 60 })
    expect({ ...after, payload: entry.payload }).toEqual(entry)
    // The other toast is the same object, so it draws nothing again.
    const rest = revised.entries.find(each => each.id !== entry.id)!
    expect(rest).toBe(other.entries.find(each => each.id !== entry.id))
  })

  it('returns the Model it was given for an entry that is not there', () => {
    expect(uploads.revise(other, 'uploads-gone', { name: 'x', percent: 1 })).toBe(other)
  })

  it('is told apart from a show: no new entry, no Command', () => {
    const revised = uploads.revise(started, first!.id, { name: 'report.pdf', percent: 99 })
    expect(revised.entries).toHaveLength(1)
  })
})
