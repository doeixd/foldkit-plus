/**
 * Windowing math tables: fixed rows, mixed measured/estimated heights,
 * overscan widening and clamping, degenerate inputs, and poisoned
 * measurements. No effects, no DOM.
 */
import { describe, expect, it } from 'vitest'
import { offsetFor, totalHeight, visibleRange } from '../src/state/index.js'

const keys = ['a', 'b', 'c', 'd', 'e']

describe('totalHeight', () => {
  it('sums measured rows', () => {
    expect(totalHeight(keys, { a: 10, b: 20, c: 30, d: 40, e: 50 }, 25)).toBe(150)
  })

  it('estimates unmeasured rows', () => {
    expect(totalHeight(keys, { a: 10 }, 25)).toBe(10 + 25 * 4)
    expect(totalHeight(keys, {}, 25)).toBe(125)
    expect(totalHeight([], {}, 25)).toBe(0)
  })

  it('falls back on poisoned measurements', () => {
    expect(totalHeight(['a', 'b'], { a: Number.NaN, b: -5 }, 25)).toBe(50)
  })
})

describe('offsetFor', () => {
  it('sums the prefix before an index', () => {
    const heights = { a: 10, b: 20, c: 30, d: 40, e: 50 }
    expect(offsetFor(0, keys, heights, 25)).toBe(0)
    expect(offsetFor(2, keys, heights, 25)).toBe(30)
    expect(offsetFor(5, keys, heights, 25)).toBe(150)
  })

  it('clamps out-of-range indexes', () => {
    expect(offsetFor(-3, keys, {}, 25)).toBe(0)
    expect(offsetFor(99, keys, {}, 25)).toBe(125)
  })
})

describe('visibleRange', () => {
  it('windows fixed rows with no overscan', () => {
    const heights = { a: 10, b: 10, c: 10, d: 10, e: 10 }
    expect(visibleRange(keys, heights, 10, 0, 25, 0)).toEqual({ start: 0, end: 3 })
    expect(visibleRange(keys, heights, 10, 15, 25, 0)).toEqual({ start: 1, end: 4 })
  })

  it('widens by overscan and clamps to the list', () => {
    const heights = { a: 10, b: 10, c: 10, d: 10, e: 10 }
    expect(visibleRange(keys, heights, 10, 15, 25, 1)).toEqual({ start: 0, end: 5 })
    expect(visibleRange(keys, heights, 10, 15, 25, 99)).toEqual({ start: 0, end: 5 })
  })

  it('is empty for empty lists, zero viewports, and scrolled-past ends', () => {
    expect(visibleRange([], {}, 10, 0, 25, 1)).toEqual({ start: 0, end: 0 })
    expect(visibleRange(keys, {}, 10, 0, 0, 1)).toEqual({ start: 0, end: 0 })
    expect(visibleRange(keys, { a: 10, b: 10, c: 10, d: 10, e: 10 }, 10, 1000, 25, 0)).toEqual({
      start: 5,
      end: 5,
    })
  })

  it('mixes measured and estimated rows', () => {
    // a is 100 tall: rows b..e start at 100, estimated 10 each.
    const heights = { a: 100 }
    expect(visibleRange(keys, heights, 10, 0, 50, 0)).toEqual({ start: 0, end: 1 })
    expect(visibleRange(keys, heights, 10, 100, 30, 0)).toEqual({ start: 1, end: 4 })
  })
})
