/**
 * On a touch screen, which keeps `:hover` on what was tapped last, the hover guard draws no
 * hover: the box stays as it rests though it is hovered, and the card's mark still shows for
 * focus, the branch beside hover. A control pressed through the recipes' `hover` shows it
 * while the finger is down, and not after.
 */
import { afterEach, expect, it } from 'vitest'
import { drawn } from './hoverGuard.js'
import { force, nodeOf } from './pseudoState.js'

let remove = () => {}
afterEach(() => remove())

it('leaves a hovered box at rest, and still shows the mark for focus', async () => {
  const page = drawn()
  remove = page.remove
  expect(matchMedia('(hover: none)').matches).toBe(true)
  const box = await nodeOf('#hovered')
  // What a tap leaves behind.
  await force(box, ['hover'])
  expect(page.filled()).toBe(false)
  await force(box, [])
  const card = await nodeOf('#card')
  await force(card, ['hover'])
  expect(page.marked()).toBe(false)
  await force(card, [])
  page.button.focus()
  expect(page.marked()).toBe(true)
})

it('shows a press while the finger is down, and not the hover it leaves', async () => {
  const page = drawn()
  remove = page.remove
  const pressed = await nodeOf('#pressable')
  await force(pressed, ['hover', 'active'])
  expect(page.lit()).toBe(true)
  await force(pressed, ['hover'])
  expect(page.lit()).toBe(false)
  await force(pressed, [])
})
