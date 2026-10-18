/**
 * Where the pointer hovers, the hover guard leaves hover as written: the box fills under the
 * pointer, and the card's mark shows while hovered or holding focus.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { drawn } from './hoverGuard.js'
import { force, nodeOf } from './pseudoState.js'

let remove = () => {}
afterEach(() => remove())
// The real pointer is shared with every test file: rest it far below what is drawn here.
beforeEach(() => userEvent.hover(document.body, { position: { x: 700, y: 600 } }))

it('fills on hover and shows the mark for hover or focus', async () => {
  const page = drawn()
  remove = page.remove
  expect(matchMedia('(hover: hover)').matches).toBe(true)
  expect(page.filled()).toBe(false)
  const box = await nodeOf('#hovered')
  await force(box, ['hover'])
  expect(page.filled()).toBe(true)
  await force(box, [])
  const card = await nodeOf('#card')
  await force(card, ['hover'])
  expect(page.marked()).toBe(true)
  await force(card, [])
  expect(page.marked()).toBe(false)
  page.button.focus()
  expect(page.marked()).toBe(true)
})

it('lights a control pressed through the recipes’ hover under the pointer', async () => {
  const page = drawn()
  remove = page.remove
  const pressed = await nodeOf('#pressable')
  expect(page.lit()).toBe(false)
  await force(pressed, ['hover'])
  expect(page.lit()).toBe(true)
  await force(pressed, [])
})
