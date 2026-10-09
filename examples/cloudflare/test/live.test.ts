// @vitest-environment node
/**
 * List membership is ids joining or leaving. Order is not a change: the page
 * draws by title, then id.
 */
import { describe, expect, it } from 'vitest'
import { membershipChange } from '../src/live.js'

describe('membershipChange', () => {
  it('names an id that joined', () => {
    expect(membershipChange(new Set(['a']), new Set(['a', 'b']))).toEqual({
      added: ['b'],
      removed: [],
    })
  })

  it('names an id that left', () => {
    expect(membershipChange(new Set(['a', 'b']), new Set(['a']))).toEqual({
      added: [],
      removed: ['b'],
    })
  })

  it('is silent when the sets are equal', () => {
    expect(membershipChange(new Set(['a']), new Set(['a']))).toBeUndefined()
  })

  it('is silent when only the iteration order differs', () => {
    expect(membershipChange(new Set(['a', 'b']), new Set(['b', 'a']))).toBeUndefined()
  })

  it('names the first id of an empty list', () => {
    expect(membershipChange(new Set(), new Set(['a']))).toEqual({ added: ['a'], removed: [] })
  })

  it('names the last id leaving', () => {
    expect(membershipChange(new Set(['a']), new Set())).toEqual({ added: [], removed: ['a'] })
  })
})
