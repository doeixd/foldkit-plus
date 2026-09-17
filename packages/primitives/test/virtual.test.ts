/**
 * Virtual lists: windowing math tables (fixed rows, gaps, padding, mixed
 * measured/estimated heights, overscan, degenerate and poisoned inputs),
 * bundle transitions (scrolls, measures, prune, restore, options
 * validation), the end check, and placement through a real assembly. No
 * effects, no DOM — Mounts live in virtual-mounts.test.ts.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import {
  isAtEnd,
  offsetFor,
  totalHeight,
  Virtual,
  VirtualMessage,
  visibleRange,
  windowFor,
  type VirtualLayout,
} from '../src/state/index.js'

const keys = ['a', 'b', 'c', 'd', 'e']
const flat: VirtualLayout = { estimatedHeight: 25, gap: 0, paddingStart: 0, paddingEnd: 0 }
const fixed = { a: 10, b: 10, c: 10, d: 10, e: 10 }

describe('totalHeight', () => {
  it('sums measured rows', () => {
    expect(totalHeight(keys, { a: 10, b: 20, c: 30, d: 40, e: 50 }, flat)).toBe(150)
  })

  it('estimates unmeasured rows', () => {
    expect(totalHeight(keys, { a: 10 }, flat)).toBe(10 + 25 * 4)
    expect(totalHeight(keys, {}, flat)).toBe(125)
    expect(totalHeight([], {}, flat)).toBe(0)
  })

  it('falls back on poisoned measurements', () => {
    expect(totalHeight(['a', 'b'], { a: Number.NaN, b: -5 }, flat)).toBe(50)
  })

  it('adds gaps between rows and padding at the ends', () => {
    const layout: VirtualLayout = { estimatedHeight: 10, gap: 4, paddingStart: 6, paddingEnd: 8 }
    // 5 rows of 10, 4 gaps of 4, paddings 6 + 8.
    expect(totalHeight(keys, fixed, layout)).toBe(6 + 50 + 16 + 8)
    expect(totalHeight([], {}, layout)).toBe(6 + 8)
  })
})

describe('offsetFor', () => {
  it('sums the prefix before an index', () => {
    const heights = { a: 10, b: 20, c: 30, d: 40, e: 50 }
    expect(offsetFor(0, keys, heights, flat)).toBe(0)
    expect(offsetFor(2, keys, heights, flat)).toBe(30)
    expect(offsetFor(5, keys, heights, flat)).toBe(150)
  })

  it('clamps out-of-range indexes', () => {
    expect(offsetFor(-3, keys, {}, flat)).toBe(0)
    expect(offsetFor(99, keys, {}, flat)).toBe(125)
  })

  it('offsets past padding and gaps', () => {
    const layout: VirtualLayout = { estimatedHeight: 10, gap: 4, paddingStart: 6, paddingEnd: 8 }
    expect(offsetFor(0, keys, fixed, layout)).toBe(6)
    expect(offsetFor(2, keys, fixed, layout)).toBe(6 + 10 + 4 + 10 + 4)
  })
})

describe('visibleRange', () => {
  const est10: VirtualLayout = { estimatedHeight: 10, gap: 0, paddingStart: 0, paddingEnd: 0 }

  it('windows fixed rows with no overscan', () => {
    expect(visibleRange(keys, fixed, est10, 0, 25, 0)).toEqual({ start: 0, end: 3 })
    expect(visibleRange(keys, fixed, est10, 15, 25, 0)).toEqual({ start: 1, end: 4 })
  })

  it('widens by overscan and clamps to the list', () => {
    expect(visibleRange(keys, fixed, est10, 15, 25, 1)).toEqual({ start: 0, end: 5 })
    expect(visibleRange(keys, fixed, est10, 15, 25, 99)).toEqual({ start: 0, end: 5 })
  })

  it('is empty for empty lists, zero viewports, and scrolled-past ends', () => {
    expect(visibleRange([], {}, est10, 0, 25, 1)).toEqual({ start: 0, end: 0 })
    expect(visibleRange(keys, {}, est10, 0, 0, 1)).toEqual({ start: 0, end: 0 })
    expect(visibleRange(keys, fixed, est10, 1000, 25, 0)).toEqual({ start: 5, end: 5 })
  })

  it('mixes measured and estimated rows', () => {
    // a is 100 tall: rows b..e start at 100, estimated 10 each.
    const heights = { a: 100 }
    expect(visibleRange(keys, heights, est10, 0, 50, 0)).toEqual({ start: 0, end: 1 })
    expect(visibleRange(keys, heights, est10, 100, 30, 0)).toEqual({ start: 1, end: 4 })
  })

  it('treats gaps as dead space between boxes', () => {
    const layout: VirtualLayout = { estimatedHeight: 10, gap: 10, paddingStart: 0, paddingEnd: 0 }
    // Boxes: a [0,10), gap, b [20,30). Viewport [10,21) touches a only at
    // the edge (not intersecting) and reaches into b.
    expect(visibleRange(keys, fixed, layout, 10, 11, 0)).toEqual({ start: 1, end: 2 })
  })
})

const List = Bundle.declare(Virtual, 'list')
const Model = Schema.Struct({ ...List.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...List.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = {
  estimatedHeight: 20,
  overscan: 1,
  gap: 0,
  paddingStart: 0,
  paddingEnd: 0,
}
const placed = Page.at(List, { args })
const config = { ...args }
const fresh: Model = {
  list: { scrollTop: 0, heights: {}, ...config },
}

const fold = (model: Model, message: Parameters<typeof List.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, List.wrapper.make(message))).model.list

describe('Virtual transitions', () => {
  it('starts from args and follows scrolls and measures', () => {
    expect(placed.init(fresh).model.list).toEqual({ scrollTop: 0, heights: {}, ...config })
    expect(fold(fresh, VirtualMessage.Scrolled({ top: 100 }))).toEqual({
      scrollTop: 100,
      heights: {},
      ...config,
    })
    const measured = fold(
      { list: { scrollTop: 100, heights: {}, ...config } },
      VirtualMessage.Measured({ key: 'b', height: 30 }),
    )
    expect(measured).toEqual({ scrollTop: 100, heights: { b: 30 }, ...config })
  })

  it('restores scroll position and measurements at init', () => {
    const restored = Page.at(List, {
      args: { ...args, initialScrollTop: 40, initialHeights: { a: 12, b: Number.NaN } },
    })
    expect(restored.init(fresh).model.list).toEqual({
      scrollTop: 40,
      heights: { a: 12 },
      ...config,
    })
  })

  it('ignores poisoned positions and heights', () => {
    expect(fold(fresh, VirtualMessage.Scrolled({ top: Number.NaN }))).toEqual(fresh.list)
    expect(fold(fresh, VirtualMessage.Scrolled({ top: -10 }))).toEqual({
      scrollTop: 0,
      heights: {},
      ...config,
    })
    expect(fold(fresh, VirtualMessage.Measured({ key: 'b', height: Number.NaN }))).toEqual(
      fresh.list,
    )
    expect(fold(fresh, VirtualMessage.Measured({ key: 'b', height: -1 }))).toEqual(fresh.list)
  })

  it('prunes heights for departed keys and keeps the rest', () => {
    const full: Model = { list: { scrollTop: 0, heights: { a: 10, b: 20, c: 30 }, ...config } }
    expect(fold(full, VirtualMessage.Prune({ keys: ['a', 'c', 'd'] }))).toEqual({
      scrollTop: 0,
      heights: { a: 10, c: 30 },
      ...config,
    })
    expect(fold(full, VirtualMessage.Prune({ keys: [] }))).toEqual({
      scrollTop: 0,
      heights: {},
      ...config,
    })
  })

  it('rejects bad options at placement', () => {
    expect(() => Page.at(List, { args: { ...args, estimatedHeight: 0 } })).toThrow(
      /args do not match/,
    )
    expect(() =>
      Page.at(List, { args: { ...args, estimatedHeight: Number.POSITIVE_INFINITY } }),
    ).toThrow(/args do not match/)
    expect(() => Page.at(List, { args: { ...args, overscan: -1 } })).toThrow(/args do not match/)
    expect(() => Page.at(List, { args: { ...args, overscan: 1.5 } })).toThrow(/args do not match/)
    expect(() => Page.at(List, { args: { ...args, gap: -2 } })).toThrow(/args do not match/)
    expect(() => Page.at(List, { args: { ...args, initialScrollTop: -1 } })).toThrow(
      /args do not match/,
    )
  })
})

describe('windowFor', () => {
  it('windows the model with its own config', () => {
    const model = { scrollTop: 100, heights: { a: 100 }, ...config }
    expect(windowFor(model, keys, 50)).toEqual({ start: 0, end: 5, totalHeight: 180 })
  })
})

describe('isAtEnd', () => {
  const model = { scrollTop: 0, heights: {}, ...config }

  it('is ended when the viewport covers the total', () => {
    // 5 rows of 20 with overscan... total is 100; viewport 50.
    expect(isAtEnd({ ...model, scrollTop: 50 }, keys, 50, 0)).toBe(true)
    expect(isAtEnd({ ...model, scrollTop: 49 }, keys, 50, 0)).toBe(false)
  })

  it('honors a threshold and clamps a negative one', () => {
    expect(isAtEnd({ ...model, scrollTop: 40 }, keys, 50, 10)).toBe(true)
    expect(isAtEnd({ ...model, scrollTop: 40 }, keys, 50, -5)).toBe(false)
  })

  it('counts an empty list as ended', () => {
    expect(isAtEnd(model, [], 50, 0)).toBe(true)
  })
})

describe('Virtual in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(placed)
    const update = assembly.update(model => ({ model }))
    const scrolled = update(fresh, List.wrapper.make(VirtualMessage.Scrolled({ top: 40 })))
    expect(scrolled.model.list).toEqual({ scrollTop: 40, heights: {}, ...config })
    expect(Object.keys(assembly.subscriptions())).toEqual([])
  })
})
