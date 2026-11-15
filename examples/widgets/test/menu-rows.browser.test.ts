import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { MENU_ID, Model, initial, update } from '../src/menu-rows/app.js'
import { MenuRows, menuRowsStyles } from '../src/menu-rows/view.js'
import { pageStylesheet } from '../src/style.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(...menuRowsStyles)
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'menu-rows'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: MenuRows,
    }),
  ).dispose
  await vi.waitFor(() => expect(trigger()).not.toBeNull())
}

const trigger = () => document.getElementById(`${MENU_ID}-button`)
const row = (index: number) => document.getElementById(`${MENU_ID}-item-${index}`)!
const picked = () => document.querySelector('[aria-label="Picked"]')?.textContent
const activeRow = () =>
  Array.from(document.querySelectorAll('[role="menuitem"]')).findIndex(item =>
    item.hasAttribute('data-active'),
  )

/** Opens the menu from the keyboard and waits for focus on its panel. */
const open = async () => {
  trigger()!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe(`${MENU_ID}-items`))
}

/** ArrowDown one row at a time: upstream reads the next row from the last drawn frame. */
const arrowTo = async (index: number) => {
  while (activeRow() !== index) {
    const before = activeRow()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(activeRow()).not.toBe(before))
  }
}

it.each([
  [0, 'Rename', 'F2'],
  [1, 'Copy', 'Text'],
  [2, 'Copy', 'Link'],
] as const)('row %i draws its icon, then %s, then the hint %s', async (index, label, hint) => {
  await mount()
  await open()
  const spans = Array.from(row(index).querySelectorAll('span'))
  const words = spans.find(span => span.textContent === label)!
  const note = spans.find(span => span.textContent === hint)!
  const icon = row(index).querySelector('svg')!
  expect(icon.parentElement?.getAttribute('aria-hidden')).toBe('true')
  const follows = (first: Node, second: Node) =>
    (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  expect(follows(icon, words)).toBe(true)
  expect(follows(words, note)).toBe(true)
})

it.each([
  ['the first', 1, 'copy-text'],
  ['the second', 2, 'copy-link'],
] as const)(
  'picking %s Copy by keyboard reports its value and returns focus to the trigger',
  async (_, index, value) => {
    await mount()
    await open()
    await arrowTo(index)
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(picked()).toBe(`Picked: ${value} (label Copy)`))
    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
  },
)
