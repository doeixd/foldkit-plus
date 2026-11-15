/// <reference types="vite/client" />
/**
 * Dragging in the Builder with a mouse, in a real browser: what the page shows
 * while a node is carried, where it lands, and what ends a drag with nothing done.
 */
import { afterEach, expect, it, vi } from 'vitest'
import {
  boxOfNode,
  longPage,
  canvas,
  centre,
  frame,
  mountBuilder,
  order,
  pointer,
  rowOf,
  rows,
  type Mounted,
} from './dragPage.js'

let mounted: Mounted | undefined
afterEach(() => {
  mounted?.dispose()
  mounted = undefined
  document.body.innerHTML = ''
})

const ready = () => vi.waitFor(() => expect(rows().length).toBeGreaterThan(3))
const names = (count: number) => Array.from({ length: count }, (_, index) => `Heading ${index}`)

/** Presses on a row and moves in steps to a point, as a hand does. */
const dragRowTo = async (id: string, to: { clientX: number; clientY: number }) => {
  const row = rowOf(id)
  if (row === undefined) throw new Error(`no row ${id}`)
  const from = centre(row)
  pointer(row, 'pointerdown', from)
  for (let step = 1; step <= 6; step++) {
    pointer(document.body, 'pointermove', {
      clientX: from.clientX + ((to.clientX - from.clientX) * step) / 6,
      clientY: from.clientY + ((to.clientY - from.clientY) * step) / 6,
    })
    await frame()
  }
}

it('marks the row a drop would land on, in the layers, and moves the node there on release', async () => {
  mounted = mountBuilder()
  await ready()
  const target = rowOf('h5')
  if (target === undefined) throw new Error('no row')
  // The last third of the row: a drop after it.
  await dragRowTo('h1', centre(target, 0.9))
  await vi.waitFor(() => expect(target.getAttribute('data-builder-drop')).toBe('after'))
  expect(rowOf('h1')?.hasAttribute('data-builder-dragging')).toBe(true)
  // Nothing moves until the drop.
  expect(order().slice(0, 3)).toEqual(['Heading 0', 'Heading 1', 'Heading 2'])
  pointer(document.body, 'pointerup', centre(target, 0.9))
  await vi.waitFor(() => expect(order()[1]).toBe('Heading 2'))
  expect(order().indexOf('Heading 1')).toBe(5)
  expect(document.querySelector('[data-builder-drop]')).toBeNull()
  expect(document.querySelector('[data-builder-dragging]')).toBeNull()
  // Announced as a key's move is.
  await vi.waitFor(() =>
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toMatch(/^Moved Heading/),
  )
})

it('marks the node a drop would land on, on the canvas', async () => {
  mounted = mountBuilder()
  await ready()
  const from = boxOfNode('h1')
  const target = boxOfNode('h6')
  if (from === null || target === null) throw new Error('no node')
  pointer(from, 'pointerdown', centre(from))
  for (let step = 1; step <= 6; step++) {
    pointer(document.body, 'pointermove', {
      clientX: centre(from).clientX,
      clientY:
        centre(from).clientY + ((centre(target, 0.1).clientY - centre(from).clientY) * step) / 6,
    })
    await frame()
  }
  await vi.waitFor(() =>
    expect(
      document.querySelector('[data-composition-drop]')?.getAttribute('data-composition-node'),
    ).toBe('h6'),
  )
  expect(
    document.querySelector('[data-composition-drop]')?.getAttribute('data-composition-drop'),
  ).toBe('before')
  pointer(document.body, 'pointerup', centre(target, 0.1))
  await vi.waitFor(() => expect(order().indexOf('Heading 1')).toBe(5))
})

it('lands where the pointer is let go, after the page moved under it mid-drag', async () => {
  mounted = mountBuilder()
  await ready()
  const target = rowOf('h6')
  if (target === undefined) throw new Error('no row')
  await dragRowTo('h1', centre(target, 0.9))
  await vi.waitFor(() => expect(target.getAttribute('data-builder-drop')).toBe('after'))
  // The layers scroll a row under the still pointer before the release.
  const tree = document.querySelector<HTMLElement>('section[data-panel="layers"]')
  if (tree === null) throw new Error('no layers')
  const at = centre(target, 0.9)
  tree.scrollTop += 28
  pointer(document.body, 'pointerup', at)
  // The row under the pointer now is the one after h6: h7.
  await vi.waitFor(() => expect(order().indexOf('Heading 1')).toBe(7))
})

it('drops nothing on Escape and on pointercancel', async () => {
  mounted = mountBuilder()
  await ready()
  const target = rowOf('h5')
  if (target === undefined) throw new Error('no row')
  await dragRowTo('h1', centre(target, 0.9))
  await vi.waitFor(() => expect(mounted?.model()?.editor.drag._tag).toBe('Some'))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await vi.waitFor(() => expect(mounted?.model()?.editor.drag._tag).toBe('None'))
  expect(order()).toEqual(names(12))

  await dragRowTo('h1', centre(target, 0.9))
  await vi.waitFor(() => expect(mounted?.model()?.editor.drag._tag).toBe('Some'))
  pointer(document.body, 'pointercancel', centre(target, 0.9))
  await vi.waitFor(() => expect(mounted?.model()?.editor.drag._tag).toBe('None'))
  expect(order()).toEqual(names(12))
})

it('treats a press that never moves past the threshold as a click, which selects', async () => {
  mounted = mountBuilder()
  await ready()
  const row = rowOf('h3')
  if (row === undefined) throw new Error('no row')
  pointer(row, 'pointerdown', centre(row))
  pointer(document.body, 'pointermove', { ...centre(row), clientY: centre(row).clientY + 2 })
  pointer(document.body, 'pointerup', centre(row))
  row.click()
  await vi.waitFor(() => expect(row.getAttribute('aria-selected')).toBe('true'))
  expect(mounted.model()?.editor.drag._tag).toBe('None')
  expect(order()).toEqual(names(12))
})

const preview = () => document.querySelector<HTMLElement>('[data-drag-source]')

it('draws what is carried in the top layer, following the pointer without a draw per move', async () => {
  mounted = mountBuilder()
  await ready()
  const target = rowOf('h5')
  if (target === undefined) throw new Error('no row')
  await dragRowTo('h1', centre(target, 0.5))
  await vi.waitFor(() => expect(preview()).not.toBeNull())
  const carried = preview()
  if (carried === null) throw new Error('no preview')
  expect(carried.textContent).toContain('Heading')
  expect(carried.getAttribute('aria-hidden')).toBe('true')
  expect(carried.matches(':popover-open')).toBe(true)
  expect(getComputedStyle(carried).pointerEvents).toBe('none')
  // Where the pointer is: the preview is beside it, whatever the page scrolled.
  const to = centre(target, 0.5)
  pointer(document.body, 'pointermove', { clientX: to.clientX + 30, clientY: to.clientY })
  await frame()
  const box = carried.getBoundingClientRect()
  expect(box.left).toBeCloseTo(to.clientX + 30 + 12, 0)
  expect(box.top).toBeCloseTo(to.clientY + 12, 0)
  // More moves over the same row are not drawn again: the element stays the same one.
  pointer(document.body, 'pointermove', { clientX: to.clientX + 60, clientY: to.clientY + 4 })
  await frame()
  expect(preview()).toBe(carried)
  expect(carried.getBoundingClientRect().left).toBeCloseTo(to.clientX + 60 + 12, 0)
  // Gone with the drop, with nothing left on the root.
  pointer(document.body, 'pointerup', to)
  await vi.waitFor(() => expect(preview()).toBeNull())
  expect(document.documentElement.style.getPropertyValue('--fk-drag-x')).toBe('')
  expect(document.documentElement.hasAttribute('data-fk-drag')).toBe(false)
})

it('takes the preview away on Escape and on a cancelled pointer', async () => {
  mounted = mountBuilder()
  await ready()
  const target = rowOf('h5')
  if (target === undefined) throw new Error('no row')
  await dragRowTo('h1', centre(target, 0.5))
  await vi.waitFor(() => expect(preview()).not.toBeNull())
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await vi.waitFor(() => expect(preview()).toBeNull())
  expect(document.documentElement.hasAttribute('data-fk-drag')).toBe(false)
  await dragRowTo('h1', centre(target, 0.5))
  await vi.waitFor(() => expect(preview()).not.toBeNull())
  pointer(document.body, 'pointercancel', centre(target, 0.5))
  await vi.waitFor(() => expect(preview()).toBeNull())
})

it('draws nothing again for pointer moves that stay in one place, over a page of 300 blocks', async () => {
  mounted = mountBuilder(longPage(300))
  await vi.waitFor(() => expect(rows().length).toBeGreaterThan(10))
  const target = rowOf('h5')
  if (target === undefined) throw new Error('no row')
  await dragRowTo('h1', centre(target, 0.5))
  await vi.waitFor(() => expect(preview()).not.toBeNull())
  await frame()
  await frame()
  const before = mounted.views()
  const at = centre(target, 0.5)
  for (let move = 0; move < 100; move++) {
    // Across the row's middle third: one place, a hundred moves.
    pointer(document.body, 'pointermove', { clientX: at.clientX + move, clientY: at.clientY })
    await frame()
  }
  expect(mounted.views()).toBe(before)
})
