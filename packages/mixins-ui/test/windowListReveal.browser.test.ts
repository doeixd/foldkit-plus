/**
 * `WindowList.reveal` brings a row far outside the window into view, at the
 * alignment asked, from rows of uneven heights none of which is measured.
 */
import { Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import type { Return } from 'foldkit/update'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import * as WindowList from '../src/windowList.js'

const COUNT = 2000
const heightOf = (index: number) => 30 + (index % 5) * 12
const items = Array.from({ length: COUNT }, (_, index) => index)

const Model = Schema.Struct({ list: WindowList.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotList: { message: WindowList.Message },
  Jump: { index: Schema.Number, align: WindowList.Align },
})
type Message = typeof Message.Type
const got = (message: WindowList.Message) => Message.GotList({ message })

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

const list = () => document.getElementById('results')!
const rowAt = (index: number) =>
  list().querySelector<HTMLElement>(`[role="listitem"][aria-posinset="${index + 1}"]`)

const JUMPS: ReadonlyArray<readonly [number, WindowList.Align]> = [
  [1500, 'start'],
  [400, 'start'],
  [1999, 'end'],
  [900, 'center'],
  [0, 'nearest'],
]

/** The application's own Message, sent by pressing the button that carries it. */
const jumpTo = (index: number, align: WindowList.Align) =>
  document.getElementById(`jump-${index}-${align}`)!.click()

const mount = async () => {
  await page.viewport(1280, 800)
  const css = document.createElement('style')
  css.dataset['test'] = ''
  css.textContent = 'body { margin: 0 } #above { height: 400px }'
  document.head.append(css)
  const above = document.createElement('div')
  above.id = 'above'
  const container = document.createElement('div')
  container.id = 'window-list-reveal'
  document.body.append(above, container)
  const runtime = Runtime.makeElement({
    Model,
    container,
    init: () => ({ model: { list: WindowList.init({ id: 'results', estimatedHeight: 38 }) } }),
    update: (model: Model, message: Message): Return<Model, Message> =>
      Message.match(message, {
        GotList: ({ message }) => {
          const next = WindowList.update(model.list, message)
          return {
            model: next.model === model.list ? model : { list: next.model },
            commands: mapMessages(next.commands ?? [], got),
          }
        },
        Jump: ({ index, align }) => ({
          model,
          commands: mapMessages([WindowList.reveal(model.list, index, align)], got),
        }),
      }),
    view: (model: Model, h: HtmlBuilder<Message>) =>
      h.div(
        [],
        [
          h.div(
            [h.Style({ position: 'fixed', right: '0', bottom: '0' })],
            JUMPS.map(([index, align]) =>
              h.button(
                [h.Id(`jump-${index}-${align}`), h.OnClick(Message.Jump({ index, align }))],
                [`${index}`],
              ),
            ),
          ),
          WindowList.view(
            {
              model: model.list,
              items,
              itemToKey: index => `row-${index}`,
              itemToView: index =>
                h.div([h.Style({ height: `${heightOf(index)}px` })], [`Row ${index}`]),
              onMessage: got,
              label: 'Results',
            },
            h,
          ),
        ],
      ),
    slow: false,
  })
  handle = Runtime.embed(runtime)
  await vi.waitFor(() => expect(rowAt(0)).not.toBeNull())
}

describe('WindowList.reveal', () => {
  test.each([1500, 400])(
    'shows row %i at the top of the viewport, drawn and still',
    async index => {
      await mount()
      window.scrollTo(0, 30_000)
      await vi.waitFor(() => expect(rowAt(0)).toBeNull())
      jumpTo(index, 'start')
      await vi.waitFor(() => {
        const row = rowAt(index)
        expect(row).not.toBeNull()
        expect(Math.abs(row!.getBoundingClientRect().top)).toBeLessThan(1)
      })
      // Still there once the frames after it have measured what moved it.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      expect(Math.abs(rowAt(index)!.getBoundingClientRect().top)).toBeLessThan(1)
    },
  )

  test('shows the last row at the end of the viewport', async () => {
    await mount()
    jumpTo(1999, 'end')
    await vi.waitFor(() => {
      const row = rowAt(1999)
      expect(row).not.toBeNull()
      expect(row!.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0)
    })
  })

  test('a row stays at the top after the rows above it are measured, with no scroll anchoring', async () => {
    document.documentElement.style.setProperty('overflow-anchor', 'none')
    await mount()
    jumpTo(1500, 'start')
    await vi.waitFor(() => expect(rowAt(1500)).not.toBeNull())
    await vi.waitFor(() =>
      expect(Math.abs(rowAt(1500)!.getBoundingClientRect().top)).toBeLessThan(1),
    )
    // Held, not passed through: stays after every frame that measures what moved it.
    for (let frame = 0; frame < 6; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve))
      expect(Math.abs(rowAt(1500)!.getBoundingClientRect().top)).toBeLessThan(1)
    }
  })

  test('scrolls at once, never smoothly', async () => {
    await mount()
    const scrolls = [vi.spyOn(Element.prototype, 'scrollIntoView'), vi.spyOn(window, 'scrollBy')]
    try {
      jumpTo(1500, 'start')
      await vi.waitFor(() => expect(rowAt(1500)).not.toBeNull())
      await vi.waitFor(() =>
        expect(Math.abs(rowAt(1500)!.getBoundingClientRect().top)).toBeLessThan(1),
      )
      const options = scrolls.flatMap(spy => spy.mock.calls.map(call => call[0]))
      expect(options.length).toBeGreaterThan(1)
      for (const option of options) expect(option).toMatchObject({ behavior: 'instant' })
    } finally {
      for (const spy of scrolls) spy.mockRestore()
    }
  })

  test('centres a row far below the window', async () => {
    await mount()
    jumpTo(900, 'center')
    await vi.waitFor(() => {
      const box = rowAt(900)!.getBoundingClientRect()
      expect(Math.abs(box.top + box.height / 2 - window.innerHeight / 2)).toBeLessThan(2)
    })
  })

  test('a row already in view, shown nearest, scrolls nothing', async () => {
    await mount()
    // Row 0 stands 400px down, in view of an 800px viewport.
    const before = window.scrollY
    jumpTo(0, 'nearest')
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(window.scrollY).toBe(before)
    expect(rowAt(0)!.getBoundingClientRect().top).toBeCloseTo(400, 0)
  })
})
