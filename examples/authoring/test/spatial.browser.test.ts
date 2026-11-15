/// <reference types="@vitest/browser-playwright" />
/**
 * The board on a real page. The arrows move focus to the nearest card in the
 * direction pressed, among cards at no row or column; a lasso dragged over a
 * region selects exactly the cards it touches; and the keyboard ends in the
 * same selection, which is read out by the same announcement.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { Frames } from 'foldkit-mixins/testing'
import { mountSpatial } from '../src/spatial/mount.js'
import { pageStylesheet } from '../src/style.js'

let handle: { readonly dispose: () => void } | undefined
let frames: ReturnType<typeof Frames.track> | undefined

beforeEach(async () => {
  Style.install(pageStylesheet)
  frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'spatial-host'
  document.body.appendChild(container)
  handle = mountSpatial(container)
  await vi.waitFor(() => expect(cards()).toHaveLength(6))
})

afterEach(() => {
  handle?.dispose()
  handle = undefined
  frames?.dispose()
  frames = undefined
  document.body.replaceChildren()
})

const cards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-card]'))
const card = (id: string) => document.querySelector<HTMLElement>(`[data-card="${id}"]`)!
const board = () => document.querySelector<HTMLElement>('[role="listbox"]')!
const selected = () =>
  cards()
    .filter(each => each.getAttribute('aria-selected') === 'true')
    .map(each => each.dataset['card'])
const idOfFocused = () => document.activeElement?.getAttribute('data-card')
const said = () =>
  document.querySelector('[data-foldkit-plus-live="polite"]')?.textContent?.trim() ?? ''
const lasso = () => board().querySelector('div')

/** A key meets the page as last drawn, so each press waits for the frame the one before caused. */
const press = async (key: string) => {
  await userEvent.keyboard(key)
  await frames?.settle()
}

const goTo = async (key: string, id: string) => {
  await press(key)
  await vi.waitFor(() => expect(idOfFocused()).toBe(id))
}

/** A drag from one point to another, in the board's own coordinates, with the real pointer. */
const dragLasso = async (from: readonly [number, number], to: readonly [number, number]) => {
  const inset = board().clientLeft
  await userEvent.dragAndDrop(board(), board(), {
    sourcePosition: { x: from[0] + inset, y: from[1] + inset },
    targetPosition: { x: to[0] + inset, y: to[1] + inset },
  })
}

test('each arrow moves focus to the nearest card that way, among cards in no rows or columns', async () => {
  card('a').focus()
  await frames?.settle()
  // Right of Alpha is Bravo; below Bravo, Echo (not Delta, which lies more aside than ahead).
  await goTo('{ArrowRight}', 'b')
  await goTo('{ArrowDown}', 'e')
  await goTo('{ArrowLeft}', 'd')
  await goTo('{ArrowUp}', 'a')
  // Charlie sits level with nothing, and Foxtrot is the nearest below it.
  await goTo('{ArrowRight}', 'b')
  await goTo('{ArrowRight}', 'c')
  await goTo('{ArrowDown}', 'f')
})

test('Home and End jump to the first and last card, and an arrow with nothing that way stays put', async () => {
  card('d').focus()
  await frames?.settle()
  await goTo('{End}', 'f')
  await press('{ArrowRight}')
  expect(idOfFocused()).toBe('f')
  await goTo('{Home}', 'a')
})

test('a lasso over a region selects exactly the cards it touches, and says how many', async () => {
  // From empty space at 140,95 to 330,170: it overlaps Charlie and Echo, and reaches no other card.
  await dragLasso([140, 95], [330, 170])
  await vi.waitFor(() => expect(selected()).toEqual(['c', 'e']))
  await vi.waitFor(() => expect(said()).toBe('2 selected'))
  expect(lasso()).toBeNull()
})

test('a lasso replaces a selection that a key made', async () => {
  card('a').focus()
  await press(' ')
  await vi.waitFor(() => expect(selected()).toEqual(['a']))
  await dragLasso([140, 95], [330, 170])
  await vi.waitFor(() => expect(selected()).toEqual(['c', 'e']))
})

test('the keyboard selects the same cards: Space on each, by arrows, ends in the lasso’s selection and announcement', async () => {
  card('c').focus()
  await frames?.settle()
  await press(' ')
  await vi.waitFor(() => expect(selected()).toEqual(['c']))
  await goTo('{ArrowDown}', 'f')
  await goTo('{ArrowLeft}', 'e')
  await press(' ')
  await vi.waitFor(() => expect(selected()).toEqual(['c', 'e']))
  await vi.waitFor(() => expect(said()).toBe('2 selected'))
  // Focus stayed where the keys put it: the selection moved nothing.
  expect(idOfFocused()).toBe('e')
})

test('both paths feed one selection: a key toggles a card the lasso selected, and the count follows', async () => {
  await dragLasso([140, 95], [330, 170])
  await vi.waitFor(() => expect(selected()).toEqual(['c', 'e']))
  card('a').focus()
  await press(' ')
  await vi.waitFor(() => expect(said()).toBe('3 selected'))
  expect(selected()).toEqual(['a', 'c', 'e'])
  card('c').focus()
  await press(' ')
  await vi.waitFor(() => expect(said()).toBe('2 selected'))
  expect(selected()).toEqual(['a', 'e'])
})

test('Clear selection empties the selection and says so', async () => {
  await dragLasso([140, 95], [330, 170])
  await vi.waitFor(() => expect(said()).toBe('2 selected'))
  await userEvent.click(
    Array.from(document.querySelectorAll('button')).find(
      button => button.textContent === 'Clear selection',
    )!,
  )
  await vi.waitFor(() => expect(selected()).toEqual([]))
  await vi.waitFor(() => expect(said()).toBe('Nothing selected'))
})

test('Escape in the middle of a lasso puts back what was selected before it', async () => {
  card('a').focus()
  await press(' ')
  await vi.waitFor(() => expect(selected()).toEqual(['a']))
  // A real pointer cannot be held across a keypress here, so the press and moves are dispatched
  // at the board, as the primitive's own tests do; the Escape is a real key.
  const at = (x: number, y: number, type: string) => {
    const box = board().getBoundingClientRect()
    board().dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: box.left + board().clientLeft + x,
        clientY: box.top + board().clientTop + y,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
      }),
    )
  }
  at(140, 95, 'pointerdown')
  at(330, 170, 'pointermove')
  await vi.waitFor(() => expect(selected()).toEqual(['c', 'e']))
  expect(lasso()).not.toBeNull()
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(selected()).toEqual(['a']))
  expect(lasso()).toBeNull()
  // The release that follows is no part of a drag any more.
  at(330, 170, 'pointerup')
  await frames?.settle()
  expect(selected()).toEqual(['a'])
})
