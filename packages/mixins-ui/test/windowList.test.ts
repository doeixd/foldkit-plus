/**
 * WindowList's Model: a reading equal to the one held returns the Model it
 * was given, a poisoned height is ignored, `keep` lets departed rows go, and
 * `windowOf` covers the part of the viewport over the list plus the overscan,
 * whether the list is above, across or below the viewport. A Scene of a page
 * drawing the list resolves its one Mount through the page's own Message.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { WindowList } from '../src/index.js'

const keys = Array.from({ length: 100 }, (_, index) => `row-${index}`)
const model = WindowList.init({ id: 'list', estimatedHeight: 20, overscan: 2, viewportHeight: 100 })
const placed = (top: number, height = 100) =>
  WindowList.update(model, WindowList.Message.Placed({ top, height })).model

describe('WindowList.init', () => {
  it('assumes the viewport at the list until the list reports', () => {
    expect(model.viewport).toEqual({ top: 0, height: 100 })
    expect(WindowList.init({ id: 'list', estimatedHeight: 20 })).toMatchObject({
      overscan: 5,
      viewport: { top: 0, height: 1000 },
    })
  })

  it.each([
    [{ estimatedHeight: 0 }, /estimatedHeight must be above 0/],
    [{ estimatedHeight: Number.NaN }, /estimatedHeight must be above 0/],
    [{ estimatedHeight: 20, overscan: -1 }, /overscan must be a whole number/],
    [{ estimatedHeight: 20, overscan: 1.5 }, /overscan must be a whole number/],
  ])('refuses %o', (config, error) => {
    expect(() => WindowList.init({ id: 'list', ...config })).toThrow(error)
  })
})

describe('WindowList.update', () => {
  it('holds a new reading of the viewport, and returns the Model for the same one', () => {
    const moved = placed(240, 90)
    expect(moved.viewport).toEqual({ top: 240, height: 90 })
    expect(
      WindowList.update(moved, WindowList.Message.Placed({ top: 240, height: 90 })).model,
    ).toBe(moved)
  })

  it('files a batch of heights, ignoring poisoned ones and returning the Model when none changed', () => {
    const measured = WindowList.update(
      model,
      WindowList.Message.Measured({
        rows: [
          { key: 'row-0', height: 33 },
          { key: 'row-1', height: Number.NaN },
          { key: 'row-2', height: -4 },
          { key: 'row-3', height: 0 },
        ],
      }),
    ).model
    expect(measured.heights).toEqual({ 'row-0': 33, 'row-3': 0 })
    const again = WindowList.Message.Measured({ rows: [{ key: 'row-0', height: 33 }] })
    expect(WindowList.update(measured, again).model).toBe(measured)
    const poisoned = WindowList.Message.Measured({ rows: [{ key: 'row-9', height: Infinity }] })
    expect(WindowList.update(measured, poisoned).model).toBe(measured)
  })

  it('files a row keyed like a prototype member as a height', () => {
    const measured = WindowList.update(
      model,
      WindowList.Message.Measured({ rows: [{ key: '__proto__', height: 12 }] }),
    ).model
    expect(Object.hasOwn(measured.heights, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(measured.heights)).toBe(Object.prototype)
  })
})

describe('WindowList.keep', () => {
  const measured = WindowList.update(
    model,
    WindowList.Message.Measured({
      rows: [
        { key: 'a', height: 10 },
        { key: 'b', height: 11 },
      ],
    }),
  ).model

  it('drops the heights of rows that left', () => {
    expect(WindowList.keep(measured, ['b', 'c']).heights).toEqual({ b: 11 })
  })

  it('returns the Model when every measured row stays', () => {
    expect(WindowList.keep(measured, ['a', 'b', 'c'])).toBe(measured)
  })
})

describe('WindowList.windowOf', () => {
  // 20px rows, a 100px viewport, 2 rows of overscan.
  it.each([
    ['at the start of the list', placed(0), { start: 0, end: 7 }],
    ['partway down it', placed(400), { start: 18, end: 27 }],
    ['the list starting 60px down the viewport', placed(-60), { start: 0, end: 4 }],
    ['the list wholly below the viewport', placed(-500), { start: 0, end: 3 }],
    ['past the end of the list', placed(5000), { start: 98, end: 100 }],
  ])('draws only what is in view, %s', (_, at, expected) => {
    expect(WindowList.windowOf(at, keys)).toEqual(expected)
  })

  it('reads measured heights before the estimate', () => {
    const tall = WindowList.update(
      placed(100),
      WindowList.Message.Measured({
        rows: keys.slice(0, 5).map(key => ({ key, height: 100 })),
      }),
    ).model
    // The viewport over 100..200 is all of row 1, the second 100px row.
    expect(WindowList.windowOf(tall, keys)).toEqual({ start: 0, end: 4 })
  })
})

describe('WindowList.resolveTrack', () => {
  const Page = defineMessageUnion({ GotList: { message: WindowList.Message } })
  type Page = typeof Page.Type
  const toPage = (message: WindowList.Message): Page => Page.GotList({ message })
  const pageUpdate = (list: WindowList.Model, message: Page) =>
    Page.match(message, {
      GotList: ({ message }) => ({ model: WindowList.update(list, message).model }),
    })
  const pageView = (list: WindowList.Model, h: HtmlBuilder<Page>): Html =>
    WindowList.view(
      {
        model: list,
        items: keys,
        itemToKey: key => key,
        itemToView: key => h.span([], [key]),
        onMessage: toPage,
      },
      h,
    )

  it("is the page's one Mount, and hands the page's update its own Message", () => {
    Scene.scene(
      { update: pageUpdate, view: pageView },
      Scene.given(model),
      Scene.Mount.expectExact(WindowList.Track),
      Scene.Mount.resolveAll(
        WindowList.resolveTrack(toPage, WindowList.Message.Placed({ top: 400, height: 100 })),
      ),
      // 400px down, a 100px viewport and 2 rows of overscan draw rows 18 to 26.
      Scene.expect(Scene.text('row-18')).toExist(),
      Scene.expect(Scene.text('row-0')).toBeAbsent(),
    )
  })
})
