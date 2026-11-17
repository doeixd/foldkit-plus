/**
 * The command palette island as the page boots it, in a real browser: a row
 * under the pointer takes the highlight the keys move, a press on the dimmed
 * backdrop closes the palette, and so does Escape. Both closings are the
 * island's `DismissLayer` subscription, which the page only has when the island
 * passes it to the runtime.
 */
import { Style } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { island } from '../src/palette/island.js'
import { PaletteSlots } from '../src/palette/view.js'
import { pageStylesheet, paletteStyle } from '../src/style.js'

afterEach(async () => {
  await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const open = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(paletteStyle(PaletteSlots))
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'palette-browser'
  document.body.append(container)
  island.mount(container)
  await vi.waitFor(() => expect(document.querySelector('button')).not.toBeNull())
  document.querySelector('button')!.click()
  await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(6))
}

const row = (index: number) => document.querySelectorAll<HTMLElement>('[role="option"]')[index]!
const fill = (element: HTMLElement) => getComputedStyle(element).backgroundColor
const isOpen = () => document.querySelector('[role="dialog"]') !== null

it('a row under the pointer is lit as the active row, and the row left is not', async () => {
  await open()
  const resting = fill(row(3))
  await userEvent.hover(row(1))
  await vi.waitFor(() => expect(row(1).hasAttribute('data-active')).toBe(true))
  expect(fill(row(1))).not.toBe(resting)
  await userEvent.hover(row(3))
  await vi.waitFor(() => expect(row(3).hasAttribute('data-active')).toBe(true))
  expect(row(1).hasAttribute('data-active')).toBe(false)
  expect(fill(row(1))).toBe(resting)
})

it('the row the keys reach is lit too, with the pointer elsewhere', async () => {
  await open()
  const resting = fill(row(5))
  document.querySelector<HTMLInputElement>('input')!.focus()
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(document.querySelector('[data-active]')).not.toBeNull())
  expect(fill(document.querySelector<HTMLElement>('[data-active]')!)).not.toBe(resting)
})

it('a press on the dimmed backdrop closes the palette', async () => {
  await open()
  await userEvent.click(document.body, { position: { x: 4, y: 4 } })
  await vi.waitFor(() => expect(isOpen()).toBe(false))
})

it('Escape closes the palette', async () => {
  await open()
  document.querySelector<HTMLInputElement>('input')!.focus()
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(isOpen()).toBe(false))
})
