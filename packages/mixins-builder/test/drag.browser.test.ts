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

const tile = (block: string) => {
  const found = document.querySelector<HTMLElement>(`button[data-block="${block}"]`)
  if (found === null) throw new Error(`no tile ${block}`)
  return found
}

/** Presses a palette tile and moves in steps to a point. */
const dragTileTo = async (block: string, to: { clientX: number; clientY: number }) => {
  const from = tile(block)
  const start = centre(from)
  pointer(from, 'pointerdown', start)
  for (let step = 1; step <= 6; step++) {
    pointer(document.body, 'pointermove', {
      clientX: start.clientX + ((to.clientX - start.clientX) * step) / 6,
      clientY: start.clientY + ((to.clientY - start.clientY) * step) / 6,
    })
    await frame()
  }
}

it('adds a tile where it is dropped on a layer row, marking the row first, and leaves the palette where it was', async () => {
  mounted = mountBuilder()
  await ready()
  const target = rowOf('h5')
  if (target === undefined) throw new Error('no row')
  const palette = document.querySelector<HTMLElement>('nav[data-panel="insert"]')
  if (palette === null) throw new Error('no palette')
  await dragTileTo('Heading', centre(target, 0.9))
  await vi.waitFor(() => expect(target.getAttribute('data-builder-drop')).toBe('after'))
  expect(document.querySelectorAll('[data-builder-drop]')).toHaveLength(1)
  expect(document.querySelector('[data-builder-drop="end"]')).toBeNull()
  // Held below the palette, over another panel: the palette is not scrolled away from under the drag.
  await new Promise(resolve => setTimeout(resolve, 300))
  expect(palette.scrollTop).toBe(0)
  const before = order().length
  pointer(document.body, 'pointerup', centre(target, 0.9))
  await vi.waitFor(() => expect(order()).toHaveLength(before + 1))
  // After h5: the old h6 is pushed to the eighth place.
  expect(order().slice(5, 8)).toEqual(['Heading 5', order()[6], 'Heading 6'])
  expect(order()[6]).not.toMatch(/^Heading \d/)
  expect(document.querySelector('[data-builder-drop]')).toBeNull()
})

it('says where a tile would land: here, marked at the end of the page over its empty space, and nowhere away from the page', async () => {
  mounted = mountBuilder(longPage(4))
  await ready()
  const page = canvas()
  if (page === null) throw new Error('no canvas')
  const box = page.getBoundingClientRect()
  const carried = () => document.querySelector('[data-drag-source]')
  const tree = document.querySelector('[role="tree"]')

  // The page's own space, below the last node: it would land last, which the frame and the layers mark.
  await dragTileTo('Heading', { clientX: box.left + box.width / 2, clientY: box.bottom - 8 })
  await vi.waitFor(() => expect(carried()?.getAttribute('data-drag-place')).toBe('here'))
  expect(document.querySelectorAll('[data-builder-drop="end"]')).toHaveLength(2)
  expect(tree?.getAttribute('data-builder-drop')).toBe('end')
  expect(page.getAttribute('data-drag-place')).toBe('here')

  // Past the page and the layers: no place, and what is carried says so.
  pointer(document.body, 'pointermove', { clientX: box.right + 400, clientY: box.bottom + 300 })
  await vi.waitFor(() => expect(carried()?.getAttribute('data-drag-place')).toBe('nowhere'))
  expect(document.querySelector('[data-builder-drop]')).toBeNull()
  expect(page.getAttribute('data-drag-place')).toBe('nowhere')
  const before = order().length
  pointer(document.body, 'pointerup', { clientX: box.right + 400, clientY: box.bottom + 300 })
  await vi.waitFor(() => expect(mounted?.model()?.editor.drag._tag).toBe('None'))
  expect(order()).toHaveLength(before)
  expect(page.hasAttribute('data-drag-place')).toBe(false)
  expect(document.querySelector('[data-builder-drop]')).toBeNull()
})

it('keeps the selected node’s commands closed until the grip opens them, whatever display a look gives the menu', async () => {
  mounted = mountBuilder(longPage(12), '[role="group"][popover] { display: grid; }')
  await ready()
  const box = boxOfNode('h2')
  if (box === null) throw new Error('no node')
  box.click()
  const menu = () => document.querySelector<HTMLElement>('[role="group"][popover]')
  await vi.waitFor(() => expect(menu()).not.toBeNull())
  expect(getComputedStyle(menu()!).display).toBe('none')
  document.querySelector<HTMLElement>('[data-builder-handle]')?.click()
  await vi.waitFor(() => expect(menu()?.matches(':popover-open')).toBe(true))
  expect(getComputedStyle(menu()!).display).toBe('grid')
  // A command can be pressed: the handle takes no pointer, and its menu must not inherit that.
  const action = menu()?.querySelector<HTMLElement>('button[data-action="duplicate"]')
  if (action === null || action === undefined) throw new Error('no command')
  const at = centre(action)
  expect(document.elementFromPoint(at.clientX, at.clientY)).toBe(action)
})

const spaced =
  '[data-builder-canvas] h2 { margin-block: 20px; } [data-composition-node="s"] > * { padding: 24px 0; }'
/** Where a new Heading went: its place among the page's Headings, whatever it says. */
const newIndex = () => order().findIndex(text => !/^Heading \d+$/.test(text ?? ''))
const settled = (count: number) => vi.waitFor(() => expect(order()).toHaveLength(count))

/** Drags a tile to a point, holds there, and says what is drawn there before letting go. */
const dropTileAt = async (to: { clientX: number; clientY: number }, node: string) => {
  const before = order().length
  await dragTileTo('Heading', to)
  const marked = `[data-composition-node="${node}"][data-composition-drop]`
  await vi.waitFor(() => expect(document.querySelector(marked)).not.toBeNull())
  const mark = document.querySelector(marked)
  const markBox = (mark?.firstElementChild ?? mark)?.getBoundingClientRect()
  const zone = mark?.getAttribute('data-composition-drop')
  pointer(document.body, 'pointerup', to)
  await settled(before + 1)
  return { index: newIndex(), mark: zone, markBox }
}

it('lands a tile in the gap between two nodes, between them, with the line drawn at that gap', async () => {
  mounted = mountBuilder(longPage(6), spaced)
  await ready()
  const above = boxOfNode('h1')?.getBoundingClientRect()
  if (above === undefined) throw new Error('no node')
  // In the margin under h1: over the Section's own space, past h1's middle and before h2's.
  const to = { clientX: above.left + above.width / 2, clientY: above.bottom + 10 }
  const { index, mark, markBox } = await dropTileAt(to, 'h2')
  expect(index).toBe(2)
  expect(mark).toBe('before')
  // The line is within a gap of the pointer, and on screen.
  expect(Math.abs((markBox?.top ?? 1e9) - to.clientY)).toBeLessThan(24)
  expect(markBox?.top).toBeGreaterThanOrEqual(0)
  expect(markBox?.bottom).toBeLessThanOrEqual(innerHeight)
})

it('lands a tile above the first node and below the last, inside their Section', async () => {
  mounted = mountBuilder(
    longPage(3),
    '[data-builder-canvas] h2 { margin-block: 6px; } [data-composition-node="s"] > * { padding: 24px 0; }',
  )
  await ready()
  const first = boxOfNode('h0')?.getBoundingClientRect()
  const last = boxOfNode('h2')?.getBoundingClientRect()
  if (first === undefined || last === undefined) throw new Error('no node')
  const top = await dropTileAt(
    { clientX: first.left + first.width / 2, clientY: first.top - 14 },
    'h0',
  )
  expect(top.index).toBe(0)
  const end = boxOfNode('h2')?.getBoundingClientRect()
  if (end === undefined) throw new Error('no node')
  const bottom = await (async () => {
    const to = { clientX: end.left + end.width / 2, clientY: end.bottom + 14 }
    const before = order().length
    await dragTileTo('Heading', to)
    // Drawn after the last Heading, inside the Section: not as the end of the page.
    await vi.waitFor(() =>
      expect(
        document
          .querySelector('[data-composition-node="h2"]')
          ?.getAttribute('data-composition-drop'),
      ).toBe('after'),
    )
    expect(document.querySelector('[data-builder-drop="end"]')).toBeNull()
    pointer(document.body, 'pointerup', to)
    await settled(before + 1)
    return (
      order().length -
      1 -
      [...order()].reverse().findIndex(text => !/^Heading \d+$/.test(text ?? ''))
    )
  })()
  expect(bottom).toBe(order().length - 1)
})

it('finds the gap along a row, and from the right in a right-to-left row', async () => {
  const row = (direction: string) =>
    `${spaced} [data-composition-node="s"] > * { display: flex; direction: ${direction}; } [data-builder-canvas] h2 { margin-inline: 24px; margin-block: 0; }`
  for (const direction of ['ltr', 'rtl']) {
    mounted = mountBuilder(longPage(4), row(direction))
    await ready()
    const one = boxOfNode('h1')?.getBoundingClientRect()
    const two = boxOfNode('h2')?.getBoundingClientRect()
    if (one === undefined || two === undefined) throw new Error('no node')
    // Between h1 and h2, wherever the direction puts them.
    const x = (Math.max(one.left, two.left) + Math.min(one.right, two.right)) / 2
    const to = {
      clientX: direction === 'ltr' ? (one.right + two.left) / 2 : (two.right + one.left) / 2,
      clientY: one.top + one.height / 2,
    }
    expect(Number.isFinite(x)).toBe(true)
    const { index } = await dropTileAt(to, 'h2')
    expect(index, direction).toBe(2)
    mounted.dispose()
    mounted = undefined
    document.body.innerHTML = ''
  }
})

it('measures only the children of the one container under the pointer, a few of them, along a gap', async () => {
  mounted = mountBuilder(longPage(300), spaced)
  await vi.waitFor(() => expect(rows().length).toBeGreaterThan(10))
  // Far down the page, so a scan from the first child would measure hundreds.
  boxOfNode('h250')?.scrollIntoView({ block: 'center' })
  await frame()
  const first = boxOfNode('h250')?.getBoundingClientRect()
  if (first === undefined) throw new Error('no node')
  const real = Element.prototype.getBoundingClientRect
  let measured = 0
  Element.prototype.getBoundingClientRect = function (this: Element) {
    measured++
    return real.call(this)
  }
  try {
    const from = tile('Heading')
    pointer(from, 'pointerdown', centre(from))
    const x = first.left + first.width / 2
    pointer(document.body, 'pointermove', { clientX: x, clientY: first.bottom + 4 })
    pointer(document.body, 'pointermove', { clientX: x, clientY: first.bottom + 6 })
    measured = 0
    for (let move = 0; move < 20; move++)
      pointer(document.body, 'pointermove', { clientX: x, clientY: first.bottom + 4 + (move % 10) })
    // A page of 300 blocks: a halving of them is a few, never one per block.
    expect(measured / 20).toBeLessThan(40)
  } finally {
    Element.prototype.getBoundingClientRect = real
  }
  pointer(document.body, 'pointercancel', centre(tile('Heading')))
})
