/**
 * WindowList on a real page, at a desktop's and a phone's size: a sticky
 * header, a block above the list and a footer below it. The document is the
 * list's whole height before anything scrolls, and only the document
 * scrolls; wherever it is scrolled, the rows drawn cover the viewport and are
 * a handful of the thousand; the header stays stuck; content above growing
 * with no scroll still moves the rows drawn; once every row is measured each
 * starts at the sum of the heights above it, and the footer where the last
 * ends.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { WindowList } from '../src/index.js'

const COUNT = 1000
/** Row heights from 30 to 60px, so an estimate alone would place them wrong. */
const heightOf = (index: number) => 30 + (index % 4) * 10
const prefix = (index: number) =>
  Array.from({ length: index }, (_, each) => heightOf(each)).reduce((a, b) => a + b, 0)
const items = Array.from({ length: COUNT }, (_, index) => index)
const itemToKey = (index: number) => `row-${index}`

const Model = Schema.Struct({ list: WindowList.Model })
type Model = typeof Model.Type

let handle: { dispose: () => void } | undefined

afterEach(async () => {
  handle?.dispose()
  handle = undefined
  window.scrollTo(0, 0)
  document.documentElement.style.removeProperty('overflow-anchor')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  await page.viewport(1440, 900)
})

const mount = async () => {
  const css = document.createElement('style')
  css.dataset['test'] = ''
  css.textContent = [
    'body { margin: 0 }',
    '#header { position: sticky; top: 0; height: 60px; background: white; z-index: 1 }',
    '#above { height: 500px }',
    '#footer { height: 300px }',
    // Padding the row is measured with: its border box, not its content.
    // An even row is padded, which its measure must count; an odd row's content has
    // margins, which must not collapse through the row and out of its measure.
    '[role="listitem"]:has(> .padded) { padding-block: 2px }',
    '.margined { margin-block: 2px }',
  ].join('\n')
  document.head.append(css)
  const header = document.createElement('div')
  header.id = 'header'
  const above = document.createElement('div')
  above.id = 'above'
  const container = document.createElement('div')
  container.id = 'window-list-browser'
  const footer = document.createElement('div')
  footer.id = 'footer'
  document.body.append(header, above, container, footer)
  const view = (model: Model, h: HtmlBuilder<WindowList.Message>) =>
    WindowList.view(
      {
        model: model.list,
        items,
        itemToKey,
        itemToView: index =>
          h.div(
            [
              h.Class(index % 2 === 0 ? 'padded' : 'margined'),
              h.Style({ height: `${heightOf(index) - 4}px` }),
            ],
            [`Row ${index}`],
          ),
        onMessage: message => message,
        label: 'Results',
      },
      h,
    )
  handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { list: WindowList.init({ id: 'results', estimatedHeight: 40 }) } }),
      update: (model: Model, message: WindowList.Message) => ({
        model: { list: WindowList.update(model.list, message).model },
        commands: [],
      }),
      view: (model, h) => view(model, h),
    }),
  )
  // Drawn: a scroll before the first frame would be clamped to a page without the list.
  await vi.waitFor(() => expect(rows().length).toBeGreaterThan(0))
  return { above, header, footer }
}

const list = () => document.getElementById('results')!
const rows = () => [...list().querySelectorAll<HTMLElement>('[role="listitem"]')]
const indexOf = (row: HTMLElement) => Number(row.getAttribute('aria-posinset')) - 1

/** The rows drawn cover the part of the viewport the list is in. */
const covered = () =>
  vi.waitFor(
    () => {
      const box = list().getBoundingClientRect()
      const top = Math.max(box.top, 0)
      const bottom = Math.min(box.bottom, window.innerHeight)
      const drawn = rows()
      expect(drawn.length).toBeGreaterThan(0)
      if (bottom > top) {
        expect(drawn[0]!.getBoundingClientRect().top).toBeLessThanOrEqual(top + 0.5)
        expect(drawn.at(-1)!.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(bottom - 0.5)
      }
      return drawn
    },
    { timeout: 5000, interval: 20 },
  )

const scrolledTo = async (y: number) => {
  window.scrollTo(0, y)
  return covered()
}

describe.each([
  ['a desktop', 1280, 800],
  ['a phone', 390, 844],
])('on %s', (_, width, height) => {
  test('the document is the whole list tall at once, and only the document scrolls', async () => {
    await page.viewport(width, height)
    const { footer } = await mount()
    const box = list().getBoundingClientRect()
    // Every row drawn or estimated: between the shortest and the tallest row each.
    expect(box.height).toBeGreaterThan(COUNT * 30)
    expect(box.height).toBeLessThan(COUNT * 60)
    expect(footer.getBoundingClientRect().top).toBeCloseTo(box.bottom, 0)
    expect(document.documentElement.scrollHeight).toBeGreaterThanOrEqual(560 + box.height + 300 - 1)
    expect(getComputedStyle(list()).overflowY).toBe('visible')
    // As a restoring browser would, at once: the rows there are drawn.
    const drawn = await scrolledTo(20_000)
    // Rows measured at other heights than the estimate move the offset by what anchoring keeps in view.
    expect(Math.abs(window.scrollY - 20_000)).toBeLessThan(60)
    expect(list().scrollTop).toBe(0)
    expect(indexOf(drawn[0]!)).toBeGreaterThan(300)
  })

  test('wherever it is scrolled, a handful of rows covers the viewport, under a header that sticks', async () => {
    await page.viewport(width, height)
    const { header } = await mount()
    await covered()
    const end = document.documentElement.scrollHeight - window.innerHeight
    for (const y of [0, 400, 3000, 17_500, end - 200, end]) {
      const drawn = await scrolledTo(y)
      expect(drawn.length).toBeLessThan(45)
      if (y > 0) expect(header.getBoundingClientRect().top).toBe(0)
    }
  })

  test('content above growing moves the rows drawn, with no scroll', async () => {
    await page.viewport(width, height)
    const { above } = await mount()
    // Without anchoring, the browser leaves the offset alone and the list moves down.
    document.documentElement.style.setProperty('overflow-anchor', 'none')
    const before = await scrolledTo(6000)
    const first = indexOf(before[0]!)
    above.style.height = '3000px'
    await vi.waitFor(() => {
      expect(window.scrollY).toBe(6000)
      expect(indexOf(rows()[0]!)).toBeLessThan(first - 20)
    })
    await covered()
  })

  test('measured, each row starts at the heights above it, and the footer at the last row’s end', async () => {
    await page.viewport(width, height)
    const { footer } = await mount()
    await covered()
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
      await scrolledTo(y)
    }
    await scrolledTo(document.documentElement.scrollHeight)
    await vi.waitFor(() => {
      const last = rows().at(-1)!
      expect(indexOf(last)).toBe(COUNT - 1)
      expect(footer.getBoundingClientRect().top).toBeCloseTo(last.getBoundingClientRect().bottom, 1)
      expect(list().getBoundingClientRect().height).toBeCloseTo(prefix(COUNT), 1)
    })
    for (const y of [700, 9000, 25_000]) {
      const drawn = await scrolledTo(y)
      const top = list().getBoundingClientRect().top
      for (const row of drawn) {
        expect(row.getBoundingClientRect().top - top).toBeCloseTo(prefix(indexOf(row)), 1)
      }
    }
  })
})
