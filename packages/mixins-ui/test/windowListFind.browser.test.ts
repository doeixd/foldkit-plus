/**
 * WindowList's `findable` stand-ins: a row outside the window is a
 * `hidden="until-found"` node with its text, in the spacers, which still add
 * up to the list's height; a match on one brings its real row to the middle
 * of the viewport. Off by default, it draws no node. A server's page draws none.
 */
import { Effect, Schema } from 'effect'
import { renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import * as WindowList from '../src/windowList.js'

const COUNT = 10_000
const ROW = 40
const items = Array.from({ length: COUNT }, (_, index) => index)
const itemToKey = (index: number) => `row-${index}`
const textOf = (index: number) => `Row ${index} findable-${index}`

const Model = Schema.Struct({ list: WindowList.Model })
type Model = typeof Model.Type

let handle: { dispose: () => void } | undefined

afterEach(async () => {
  handle?.dispose()
  handle = undefined
  window.scrollTo(0, 0)
  location.hash = ''
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  await page.viewport(1440, 900)
})

const list = () => document.getElementById('results')!
const rows = () => [...list().querySelectorAll<HTMLElement>('[role="listitem"]')]
const indexOf = (row: Element) => Number(row.getAttribute('aria-posinset')) - 1
const standIns = () => [...list().querySelectorAll<HTMLElement>('[data-window-list-find]')]
const standInOf = (index: number) =>
  list().querySelector<HTMLElement>(`[data-window-list-find="${index}"]`)

const view = (findable: boolean) => (model: Model, h: HtmlBuilder<WindowList.Message>) =>
  WindowList.view(
    {
      model: model.list,
      items,
      itemToKey,
      itemToView: index => h.div([h.Style({ height: `${ROW}px` })], [textOf(index)]),
      onMessage: message => message,
      label: 'Results',
      ...(findable ? { findable: (_: number, index: number) => textOf(index) } : {}),
    },
    h,
  )

const mount = async (findable: boolean) => {
  await page.viewport(1280, 800)
  const css = document.createElement('style')
  css.dataset['test'] = ''
  css.textContent = 'body { margin: 0 } #above { height: 300px }'
  document.head.append(css)
  const above = document.createElement('div')
  above.id = 'above'
  const container = document.createElement('div')
  container.id = 'window-list-find'
  document.body.append(above, container)
  handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { list: WindowList.init({ id: 'results', estimatedHeight: ROW }) } }),
      update: (model: Model, message: WindowList.Message) => {
        const next = WindowList.update(model.list, message)
        return {
          model: next.model === model.list ? model : { list: next.model },
          commands: next.commands ?? [],
        }
      },
      view: view(findable),
      slow: false,
    }),
  )
  await vi.waitFor(() => expect(rows().length).toBeGreaterThan(0))
}

test('the browser reports find matches in rows it does not draw', () => {
  expect(WindowList.supportsFindable()).toBe(true)
})

describe('with findable', () => {
  test('a row outside the window has its text in the page, one drawn has none', async () => {
    await mount(true)
    await vi.waitFor(() => expect(standIns().length).toBeGreaterThan(0))
    const drawn = rows().map(indexOf)
    expect(standIns().length).toBe(COUNT - drawn.length)
    for (const index of drawn) expect(standInOf(index)).toBeNull()
    expect(standInOf(7000)!.textContent).toBe(textOf(7000))
    expect(standInOf(7000)!.getAttribute('hidden')).toBe('until-found')
    expect(standInOf(0)).toBeNull()
    // In groups the browser skips as one, none of them takes room.
    const groups = [...list().querySelectorAll<HTMLElement>('[data-edge] > [hidden]')]
    expect(groups.length).toBeGreaterThan(90)
    for (const group of groups) {
      expect(group.getBoundingClientRect().height).toBe(0)
      expect(group.childElementCount).toBeLessThanOrEqual(100)
    }
  })

  test('the spacers still add up to the list', async () => {
    await mount(true)
    await vi.waitFor(() => expect(standIns().length).toBeGreaterThan(0))
    for (const y of [0, 5000, 200_000, 399_000]) {
      window.scrollTo(0, y)
      await vi.waitFor(() => expect(rows().length).toBeGreaterThan(0))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const top = list().getBoundingClientRect().top
      expect(list().getBoundingClientRect().height).toBeCloseTo(COUNT * ROW, 1)
      for (const row of rows()) {
        expect(row.getBoundingClientRect().top - top).toBeCloseTo(indexOf(row) * ROW, 1)
      }
    }
  })

  test('a stand-in matched brings its row to the middle of the viewport', async () => {
    await mount(true)
    await vi.waitFor(() => expect(standInOf(7000)).not.toBeNull())
    standInOf(7000)!.dispatchEvent(new Event('beforematch', { bubbles: true }))
    await vi.waitFor(() => {
      const row = rows().find(each => indexOf(each) === 7000)
      expect(row).toBeDefined()
      const box = row!.getBoundingClientRect()
      expect(Math.abs(box.top + box.height / 2 - window.innerHeight / 2)).toBeLessThan(2)
    })
  })

  test('the browser revealing a stand-in, as a fragment navigation does, finds its row too', async () => {
    await mount(true)
    await vi.waitFor(() => expect(standInOf(4321)).not.toBeNull())
    const standIn = standInOf(4321)!
    standIn.id = 'found-by-the-browser'
    location.hash = '#found-by-the-browser'
    await vi.waitFor(() => {
      const row = rows().find(each => indexOf(each) === 4321)
      expect(row).toBeDefined()
      const box = row!.getBoundingClientRect()
      expect(Math.abs(box.top + box.height / 2 - window.innerHeight / 2)).toBeLessThan(2)
    })
    // The browser took `hidden` off it to show the match; the list puts it back.
    await vi.waitFor(() => expect(standIn.getAttribute('hidden')).toBe('until-found'))
  })

  test('a stand-in matched is hidden again, and the list is as tall as before', async () => {
    await mount(true)
    await vi.waitFor(() => expect(standInOf(7000)).not.toBeNull())
    const standIn = standInOf(7000)!
    standIn.dispatchEvent(new Event('beforematch', { bubbles: true }))
    expect(standIn.style.position).toBe('absolute')
    await vi.waitFor(() => expect(standIn.hasAttribute('style')).toBe(false))
    expect(standIn.getAttribute('hidden')).toBe('until-found')
    await vi.waitFor(() =>
      expect(list().getBoundingClientRect().height).toBeCloseTo(COUNT * ROW, 1),
    )
  })

  test('a match outside the stand-ins is not a find', async () => {
    await mount(true)
    window.scrollTo(0, 100_000)
    await vi.waitFor(() => expect(indexOf(rows()[0]!)).toBeGreaterThan(2000))
    const before = window.scrollY
    // A spacer sits where the stand-ins do, and is no row's text.
    list()
      .querySelector('[data-edge="end"]')!
      .dispatchEvent(new Event('beforematch', { bubbles: true }))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(window.scrollY).toBe(before)
  })
})

describe('without findable', () => {
  test('no row has a stand-in, and the spacers hold nothing', async () => {
    await mount(false)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(standIns()).toEqual([])
    for (const spacer of list().querySelectorAll('[data-edge]')) {
      expect(spacer.childElementCount).toBe(0)
      expect(spacer.hasAttribute('data-from')).toBe(false)
    }
  })
})

test('a server draws no stand-ins', async () => {
  await page.viewport(1280, 800)
  const container = document.createElement('div')
  container.id = 'window-list-find-served'
  document.body.append(container)
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: { list: WindowList.init({ id: 'results', estimatedHeight: ROW }) } }),
        view: (model: Model, h: HtmlBuilder<WindowList.Message>) => ({
          title: 'List',
          body: view(true)(model, h),
        }),
      },
      { buildId: 'b' },
    ),
  )
  container.innerHTML = served.html
  expect(standIns()).toEqual([])
  expect(list().querySelectorAll('[data-edge]').length).toBe(2)
})
