/**
 * The window list's go-to row and its find, in Chromium: typing a row's number
 * and pressing Go brings that row into view while the list draws about thirty
 * of its thousand rows; a match the browser reports on a row not drawn does
 * the same; and a name holding focus stays drawn when the page scrolls away.
 */
import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { Model, NAMES, initial, update } from '../src/window-list/app.js'
import { WindowListIsland, windowListStyles } from '../src/window-list/view.js'
import { pageStylesheet } from '../src/style.js'

let dispose = () => {}
afterEach(async () => {
  dispose()
  window.scrollTo(0, 0)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  await page.viewport(1280, 800)
})

const mount = async () => {
  await page.viewport(1280, 800)
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(...windowListStyles)
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'window-list'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: (model, h) => WindowListIsland(model, h),
      slow: false,
    }),
  ).dispose
  await vi.waitFor(() => expect(drawn().length).toBeGreaterThan(0))
}

const list = () => document.getElementById('window-list/names')!
const drawn = () => [...list().querySelectorAll<HTMLElement>('[role="listitem"]')]
const rowOf = (name: string) => drawn().find(row => row.textContent === name)

// The row's middle lies in the window, below the sticky heading's own height.
const inView = (row: HTMLElement) => {
  const box = row.getBoundingClientRect()
  return box.top >= 0 && box.bottom <= window.innerHeight
}

const goTo = async (number: string) => {
  await page.getByLabelText('Go to row').fill(number)
  await userEvent.keyboard('{Enter}')
}

it('goes to row 700 from the form, with the row in view and about thirty rows drawn', async () => {
  await mount()
  await goTo('700')
  await vi.waitFor(() => {
    const row = rowOf(NAMES[699]!)
    expect(row).toBeDefined()
    expect(inView(row!)).toBe(true)
  })
  expect(drawn().length).toBeLessThan(45)
  expect(rowOf(NAMES[0]!)).toBeUndefined()
})

it('does nothing for a row past the list, and the form does not submit', async () => {
  await mount()
  await goTo('1200')
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  expect(window.scrollY).toBe(0)
  expect(rowOf(NAMES[0]!)).toBeDefined()
})

it('brings a row into view when the browser finds its text, though the row is not drawn', async () => {
  await mount()
  // Stand-ins are drawn once the list is placed.
  await vi.waitFor(() =>
    expect(list().querySelector('[data-window-list-find="800"]')).not.toBeNull(),
  )
  expect(rowOf(NAMES[800]!)).toBeUndefined()
  list()
    .querySelector('[data-window-list-find="800"]')!
    .dispatchEvent(new Event('beforematch', { bubbles: true }))
  await vi.waitFor(() => {
    const row = rowOf(NAMES[800]!)
    expect(row).toBeDefined()
    expect(inView(row!)).toBe(true)
  })
})

it('keeps a name holding focus drawn, and focused, after the page scrolls far from it', async () => {
  await mount()
  const held = rowOf(NAMES[2]!)!.querySelector<HTMLElement>('[tabindex]')!
  held.focus()
  // The form would take focus: scroll the page itself.
  window.scrollTo(0, 20_000)
  await vi.waitFor(() => expect(rowOf(NAMES[495]!)).toBeDefined())
  expect(rowOf(NAMES[2]!)).toBeDefined()
  expect(document.activeElement).toBe(held)
  expect(drawn().length).toBeLessThan(45)
})
