/**
 * Pure helpers: range tables, relative-time tables, platform tables. No
 * effects, no DOM; vitest runs them anywhere.
 */
import { describe, expect, it } from 'vitest'
import { range } from '../src/state/index.js'

describe('range', () => {
  it('counts up half-open from the start', () => {
    expect(range(1, 4)).toEqual([1, 2, 3])
    expect(range(0, 0)).toEqual([])
    expect(range(5, 5)).toEqual([])
  })

  it('counts down with a negative step', () => {
    expect(range(3, 0, -1)).toEqual([3, 2, 1])
  })

  it('steps over the middle', () => {
    expect(range(0, 10, 3)).toEqual([0, 3, 6, 9])
  })

  it('is empty when the direction disagrees', () => {
    expect(range(5, 1)).toEqual([])
    expect(range(1, 5, -1)).toEqual([])
  })

  it('throws on a zero or non-finite step', () => {
    expect(() => range(0, 1, 0)).toThrow(/non-zero finite/)
    expect(() => range(0, 1, Number.NaN)).toThrow(/non-zero finite/)
    expect(() => range(0, 1, Number.POSITIVE_INFINITY)).toThrow(/non-zero finite/)
  })
})
