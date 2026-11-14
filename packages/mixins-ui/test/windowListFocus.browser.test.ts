/**
 * WindowList keeps the row holding focus drawn while it is outside the
 * window: scrolled far away, the control keeps focus, the next Tab goes on
 * from it, and the row sits in flow where it was, so no row moves and the
 * document is as tall as before; once focus leaves, the row goes.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import * as WindowList from '../src/windowList.js'

const COUNT = 1000
// Rows exactly the estimate, so every offset is exact and any shift is the keeping.
const ROW = 40
const items = Array.from({ length: COUNT }, (_, index) => index)
const itemToKey = (index: number) => `row-${index}`

const Model = Schema.Struct({ list: WindowList.Model })
type Model = typeof Model.Type

let handle: { dispose: () => void } | undefined
let latest: WindowList.Model

afterEach(async () => {
  handle?.dispose()
  handle = undefined
  window.scrollTo(0, 0)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  await page.viewport(1440, 900)
})

const list = () => document.getElementById('results')!
const rows = () => [...list().querySelectorAll<HTMLElement>('[role="listitem"]')]
const indexOf = (row: Element) => Number(row.getAttribute('aria-posinset')) - 1
const drawn = () => rows().map(indexOf)
const button = (index: number) => document.getElementById(`b-${index}`)
const activeId = () => document.activeElement?.id

const mount = async () => {
  await page.viewport(1280, 800)
  const css = document.createElement('style')
  css.dataset['test'] = ''
  css.textContent = 'body { margin: 0 }'
  document.head.append(css)
  const before = document.createElement('button')
  before.id = 'before'
  before.textContent = 'before'
  const above = document.createElement('div')
  above.style.height = '300px'
  const container = document.createElement('div')
  container.id = 'window-list-focus'
  const after = document.createElement('button')
  after.id = 'after'
  after.textContent = 'after'
  document.body.append(before, above, container, after)
  latest = WindowList.init({ id: 'results', estimatedHeight: ROW })
  handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { list: latest } }),
      update: (model: Model, message: WindowList.Message) => {
        latest = WindowList.update(model.list, message).model
        return { model: { list: latest }, commands: [] }
      },
      view: (model: Model, h: HtmlBuilder<WindowList.Message>) =>
        WindowList.view(
          {
            model: model.list,
            items,
            itemToKey,
            itemToView: index =>
              h.div(
                [h.Style({ height: `${ROW}px` })],
                [
                  h.button([h.Id(`b-${index}`)], [`Button ${index}`]),
                  h.input([h.Id(`i-${index}`), h.Attribute('tabindex', '-1')]),
                ],
              ),
            onMessage: message => message,
            label: 'Results',
          },
          h,
        ),
      slow: false,
    }),
  )
  await vi.waitFor(() => expect(rows().length).toBeGreaterThan(0))
}

/** The document is as tall as the list, and every row drawn, kept or not, is at its offset. */
const exact = () => {
  const top = list().getBoundingClientRect().top
  expect(list().getBoundingClientRect().height).toBeCloseTo(COUNT * ROW, 1)
  for (const row of rows()) {
    expect(row.getBoundingClientRect().top - top).toBeCloseTo(indexOf(row) * ROW, 1)
  }
}

const scrolledPast = async (y: number, index: number) => {
  window.scrollTo(0, y)
  await vi.waitFor(() =>
    expect(Math.min(...drawn().filter(each => each !== index))).toBeGreaterThan(index + 20),
  )
}

/** Tab to the button of row 0 and scroll the row far above the window. */
const holdRowZeroAway = async () => {
  await mount()
  document.getElementById('before')!.focus()
  await userEvent.tab()
  expect(activeId()).toBe('b-0')
  await vi.waitFor(() => expect(latest.held).toEqual(Option.some('row-0')))
  await scrolledPast(20_000, 0)
}

describe('a row holding focus, outside the window', () => {
  test('stays drawn, with focus, at its offset, under spacers that still add up', async () => {
    await holdRowZeroAway()
    expect(drawn()[0]).toBe(0)
    expect(activeId()).toBe('b-0')
    exact()
    // Where it was, and the document as tall, as the window moves on.
    for (const y of [24_000, 30_000, 21_000]) {
      window.scrollTo(0, y)
      await vi.waitFor(() =>
        expect(Math.min(...drawn().filter(each => each > 0))).toBeGreaterThan(300),
      )
      expect(activeId()).toBe('b-0')
      exact()
    }
  })

  test('the next Tab goes on from it, to the first row drawn after it', async () => {
    await holdRowZeroAway()
    const first = drawn()[1]!
    await userEvent.tab()
    expect(activeId()).toBe(`b-${first}`)
  })

  test('Shift+Tab from it goes to the control before the list', async () => {
    await holdRowZeroAway()
    await userEvent.tab({ shift: true })
    expect(activeId()).toBe('before')
  })

  test('goes once focus leaves it, and the document stays as tall', async () => {
    await holdRowZeroAway()
    ;(document.activeElement as HTMLElement).blur()
    await vi.waitFor(() => expect(drawn()).not.toContain(0))
    expect(latest.held).toEqual(Option.none())
    exact()
  })

  test('below the window too: focus a row, scroll up past it', async () => {
    await mount()
    window.scrollTo(0, 20_000)
    await vi.waitFor(() => expect(drawn()[0]).toBeGreaterThan(300))
    const held = drawn()[Math.floor(drawn().length / 2)]!
    button(held)!.focus({ preventScroll: true })
    await vi.waitFor(() => expect(latest.held).toEqual(Option.some(`row-${held}`)))
    window.scrollTo(0, 3000)
    await vi.waitFor(() =>
      expect(Math.max(...drawn().filter(each => each !== held))).toBeLessThan(held - 20),
    )
    expect(activeId()).toBe(`b-${held}`)
    expect(drawn().at(-1)).toBe(held)
    exact()
    const previous = drawn().at(-2)!
    await userEvent.tab({ shift: true })
    expect(activeId()).toBe(`b-${previous}`)
  })

  test('below the window, Tab goes on to the control after the list', async () => {
    await mount()
    window.scrollTo(0, 20_000)
    await vi.waitFor(() => expect(drawn()[0]).toBeGreaterThan(300))
    const held = drawn()[Math.floor(drawn().length / 2)]!
    button(held)!.focus({ preventScroll: true })
    await vi.waitFor(() => expect(latest.held).toEqual(Option.some(`row-${held}`)))
    window.scrollTo(0, 3000)
    await vi.waitFor(() => expect(drawn().at(-1)).toBe(held))
    await userEvent.tab()
    expect(activeId()).toBe('after')
  })

  test('a row that was in the window keeps focus as the window passes it', async () => {
    await mount()
    window.scrollTo(0, 2000)
    await vi.waitFor(() => expect(drawn()[0]).toBeGreaterThan(20))
    const held = drawn()[Math.floor(drawn().length / 2)]!
    button(held)!.focus({ preventScroll: true })
    await vi.waitFor(() => expect(latest.held).toEqual(Option.some(`row-${held}`)))
    // Both ways, in steps small enough that the row leaves at the window's edge.
    for (const y of [2300, 2800, 4000, 20_000, 3000, 1500, 100]) {
      window.scrollTo(0, y)
      await vi.waitFor(() => expect(drawn()).toContain(held))
      await vi.waitFor(() => expect(activeId()).toBe(`b-${held}`))
      exact()
    }
  })

  test('tabbing on through the list needs no pause for the window to follow', async () => {
    await mount()
    document.getElementById('before')!.focus()
    const seen: number[] = []
    for (let step = 0; step < 80; step++) {
      await userEvent.tab()
      seen.push(Number(activeId()!.slice(2)))
    }
    expect(seen).toEqual(Array.from({ length: 80 }, (_, index) => index))
  })

  test('focus in the page elsewhere keeps nothing', async () => {
    await mount()
    window.scrollTo(0, 20_000)
    await vi.waitFor(() => expect(drawn()[0]).toBeGreaterThan(300))
    document.getElementById('after')!.focus({ preventScroll: true })
    expect(latest.held).toEqual(Option.none())
    expect(drawn()).not.toContain(0)
  })

  test('an input in the row keeps its value and caret when the window passes it', async () => {
    await mount()
    window.scrollTo(0, 2000)
    await vi.waitFor(() => expect(drawn()[0]).toBeGreaterThan(20))
    const held = drawn()[Math.floor(drawn().length / 2)]!
    const input = document.getElementById(`i-${held}`) as HTMLInputElement
    input.value = 'hello world'
    input.focus({ preventScroll: true })
    input.setSelectionRange(3, 5)
    await vi.waitFor(() => expect(latest.held).toEqual(Option.some(`row-${held}`)))
    // The held row leaves the window at its top edge, which moves it in the DOM.
    window.scrollTo(0, 6000)
    await vi.waitFor(() =>
      expect(Math.min(...drawn().filter(each => each !== held))).toBeGreaterThan(held),
    )
    expect(document.activeElement).toBe(input)
    expect([input.value, input.selectionStart, input.selectionEnd]).toEqual(['hello world', 3, 5])
  })
})
