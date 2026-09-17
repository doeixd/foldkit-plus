/**
 * Windowing math tables: fixed rows, mixed measured/estimated heights,
 * overscan widening and clamping, degenerate inputs, and poisoned
 * measurements. No effects, no DOM.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  offsetFor,
  RowMeasured,
  totalHeight,
  Viewport,
  ViewportScrolled,
  Virtual,
  VirtualMessage,
  visibleRange,
  windowFor,
} from '../src/state/index.js'
import { takeMessages } from './support.js'

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

const List = Bundle.declare(Virtual, 'list')
const Model = Schema.Struct({ ...List.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...List.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const options = { estimatedHeight: 20, overscan: 1 }
const placed = Page.at(List, { args: options })
const fresh: Model = { list: { scrollTop: 0, heights: {} } }

const fold = (model: Model, message: Parameters<typeof List.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, List.wrapper.make(message))).model.list

describe('Virtual transitions', () => {
  it('starts unscrolled and unmeasured, follows scrolls and measures', () => {
    expect(placed.init(fresh).model.list).toEqual({ scrollTop: 0, heights: {} })
    expect(fold(fresh, VirtualMessage.Scrolled({ top: 100 }))).toEqual({
      scrollTop: 100,
      heights: {},
    })
    const measured = fold(
      { list: { scrollTop: 100, heights: {} } },
      VirtualMessage.Measured({ key: 'b', height: 30 }),
    )
    expect(measured).toEqual({ scrollTop: 100, heights: { b: 30 } })
  })

  it('ignores poisoned positions and heights', () => {
    expect(fold(fresh, VirtualMessage.Scrolled({ top: Number.NaN }))).toEqual(fresh.list)
    expect(fold(fresh, VirtualMessage.Scrolled({ top: -10 }))).toEqual({
      scrollTop: 0,
      heights: {},
    })
    expect(fold(fresh, VirtualMessage.Measured({ key: 'b', height: Number.NaN }))).toEqual(
      fresh.list,
    )
    expect(fold(fresh, VirtualMessage.Measured({ key: 'b', height: -1 }))).toEqual(fresh.list)
  })

  it('rejects bad options at placement', () => {
    expect(() => Page.at(List, { args: { estimatedHeight: 0, overscan: 1 } })).toThrow(
      /args do not match/,
    )
    expect(() =>
      Page.at(List, { args: { estimatedHeight: Number.POSITIVE_INFINITY, overscan: 1 } }),
    ).toThrow(/args do not match/)
    expect(() => Page.at(List, { args: { estimatedHeight: 20, overscan: -1 } })).toThrow(
      /args do not match/,
    )
    expect(() => Page.at(List, { args: { estimatedHeight: 20, overscan: 1.5 } })).toThrow(
      /args do not match/,
    )
  })
})

describe('windowFor', () => {
  it('windows the model with the placement options', () => {
    const model = { scrollTop: 100, heights: { a: 100 } }
    expect(windowFor(model, keys, 50, { estimatedHeight: 10, overscan: 0 })).toEqual({
      start: 1,
      end: 5,
      totalHeight: 140,
    })
  })
})

describe('Virtual in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(placed)
    const update = assembly.update(model => ({ model }))
    const scrolled = update(fresh, List.wrapper.make(VirtualMessage.Scrolled({ top: 40 })))
    expect(scrolled.model.list).toEqual({ scrollTop: 40, heights: {} })
    expect(Object.keys(assembly.subscriptions())).toEqual([])
  })
})
