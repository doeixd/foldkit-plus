/// <reference types="vite/client" />
/**
 * Dragging in the Builder with a finger, in the `browser-touch` project, whose page
 * is a touch screen from the start: a handle always there to hold, held to drag
 * without the page scrolling, a tap that opens commands rather than a drag, and
 * the rest of the page scrolling as it does.
 */
import { HOLD_TO_DRAG_MS } from 'foldkit-primitives/dom'
import { afterEach, expect, it, vi } from 'vitest'
import {
  boxOfNode,
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
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const grip = () => document.querySelector<HTMLElement>('[data-builder-handle]')
const preview = () => document.querySelector<HTMLElement>('[data-drag-source]')
const dragging = () => mounted?.model()?.editor.drag._tag

/** A finger's pointer event. */
const finger = (
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  where: { clientX: number; clientY: number },
) => pointer(target, type, where, 'touch')

const touchmove = (target: Element) => {
  const event = new TouchEvent('touchmove', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

/** Selects the node of `id` as a tap on the page does. */
const select = async (id: string) => {
  const box = boxOfNode(id)
  if (box === null) throw new Error(`no node ${id}`)
  box.click()
  await vi.waitFor(() => expect(grip()?.getAttribute('data-builder-handle')).toBe(id))
}

it('is on a touch screen', () => {
  expect(matchMedia('(pointer: coarse)').matches).toBe(true)
})

it('draws a handle for the selected node with no hover, a finger wide at least', async () => {
  mounted = mountBuilder()
  await ready()
  expect(grip()).toBeNull()
  await select('h2')
  const handle = grip()
  if (handle === null) throw new Error('no handle')
  const box = handle.getBoundingClientRect()
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  const style = getComputedStyle(handle)
  expect(style.visibility).toBe('visible')
  expect(style.display).not.toBe('none')
  // Held to drag, so it must neither scroll the page, select text nor open the browser's menu.
  expect(style.touchAction).toBe('none')
  expect(style.userSelect).toBe('none')
  // The rest of the page keeps scrolling: nothing else takes the finger.
  expect(getComputedStyle(boxOfNode('h3') as Element).touchAction).toBe('auto')
  expect(getComputedStyle(rowOf('h3') as Element).touchAction).toBe('auto')
  expect(getComputedStyle(canvas() as Element).touchAction).toBe('auto')
})

it('opens the commands of the node on a tap of the handle, and starts no drag', async () => {
  mounted = mountBuilder()
  await ready()
  await select('h2')
  const handle = grip()
  if (handle === null) throw new Error('no handle')
  const at = centre(handle)
  finger(handle, 'pointerdown', at)
  finger(document.body, 'pointerup', at)
  handle.click()
  const menu = document.querySelector<HTMLElement>('[popover="auto"]')
  await vi.waitFor(() => expect(menu?.matches(':popover-open')).toBe(true))
  expect(dragging()).toBe('None')
  // Every command a key has: moving, indenting, duplicating, deleting.
  const actions = Array.from(menu?.querySelectorAll('button') ?? []).map(each =>
    each.getAttribute('data-action'),
  )
  expect(actions).toEqual(
    expect.arrayContaining(['move-up', 'move-down', 'move-out', 'move-in', 'duplicate', 'delete']),
  )
  const down = menu?.querySelector<HTMLElement>('[data-action="move-down"]')
  expect(down?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  down?.click()
  await vi.waitFor(() => expect(order().indexOf('Heading 2')).toBe(3))
  // What it chose closes it, as a menu is; and the result is announced as a key's is.
  await vi.waitFor(() => expect(menu?.matches(':popover-open')).toBe(false))
  await vi.waitFor(() =>
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toMatch(/^Moved Heading/),
  )
})

it('drags the node by a hold on the handle, lifts the preview clear of the finger, and drops', async () => {
  mounted = mountBuilder()
  await ready()
  await select('h2')
  const handle = grip()
  const target = boxOfNode('h6')
  if (handle === null || target === null) throw new Error('no handle')
  // A finger can only be put where the canvas shows the target: past its edge is another panel's.
  target.scrollIntoView({ block: 'center' })
  finger(handle, 'pointerdown', centre(handle))
  const menu = new Event('contextmenu', { bubbles: true, cancelable: true })
  handle.dispatchEvent(menu)
  expect(menu.defaultPrevented).toBe(true)
  await wait(HOLD_TO_DRAG_MS + 100)
  await vi.waitFor(() => expect(dragging()).toBe('Some'))
  expect(touchmove(handle).defaultPrevented).toBe(true)
  // The page scrolls the selected node into view as the hold goes by, so the target is
  // measured at each move rather than once.
  let to = centre(target, 0.9)
  await vi.waitFor(() => {
    to = centre(target, 0.9)
    finger(document.body, 'pointermove', to)
    expect(
      document.querySelector('[data-composition-drop]')?.getAttribute('data-composition-node'),
    ).toBe('h6')
  })
  await vi.waitFor(() => expect(preview()).not.toBeNull())
  await frame()
  // Above the finger, not under it.
  expect(preview()?.getBoundingClientRect().bottom).toBeLessThanOrEqual(to.clientY)
  // And centred over it, so the edge of a phone cuts neither side.
  const lifted = preview()?.getBoundingClientRect()
  expect((lifted?.left ?? 0) + (lifted?.width ?? 0) / 2).toBeCloseTo(to.clientX, 0)
  finger(document.body, 'pointerup', to)
  await vi.waitFor(() => expect(order().indexOf('Heading 2')).toBe(6))
  expect(preview()).toBeNull()
})

it('leaves a finger that moves before the hold to scroll, and drags nothing', async () => {
  mounted = mountBuilder()
  await ready()
  const row = rowOf('h3')
  if (row === undefined) throw new Error('no row')
  const from = centre(row)
  finger(row, 'pointerdown', from)
  finger(document.body, 'pointermove', { ...from, clientY: from.clientY + 20 })
  // The page is left to scroll: the move is not refused.
  expect(touchmove(row).defaultPrevented).toBe(false)
  await wait(HOLD_TO_DRAG_MS + 100)
  expect(dragging()).toBe('None')
  expect(preview()).toBeNull()
})

it('drops nothing on a cancelled finger', async () => {
  mounted = mountBuilder()
  await ready()
  const row = rowOf('h3')
  if (row === undefined) throw new Error('no row')
  const from = centre(row)
  finger(row, 'pointerdown', from)
  await wait(HOLD_TO_DRAG_MS + 100)
  await vi.waitFor(() => expect(dragging()).toBe('Some'))
  finger(document.body, 'pointercancel', from)
  await vi.waitFor(() => expect(dragging()).toBe('None'))
  expect(order()[3]).toBe('Heading 3')
})

it('scrolls the layers while a held finger is near their edge', async () => {
  mounted = mountBuilder()
  await ready()
  const panel = document.querySelector<HTMLElement>('section[data-panel="layers"]')
  const row = rowOf('h1')
  if (panel === null || row === undefined) throw new Error('no panel')
  const box = panel.getBoundingClientRect()
  const from = centre(row)
  finger(row, 'pointerdown', from)
  await wait(HOLD_TO_DRAG_MS + 100)
  await vi.waitFor(() => expect(dragging()).toBe('Some'))
  finger(document.body, 'pointermove', { clientX: from.clientX, clientY: box.bottom - 6 })
  await vi.waitFor(() => expect(panel.scrollTop).toBeGreaterThan(20))
  finger(document.body, 'pointercancel', from)
})

it('scrolls the canvas while a held finger is near its edge', async () => {
  mounted = mountBuilder()
  await ready()
  const stage = canvas()
  const node = boxOfNode('h1')
  if (stage === null || node === null) throw new Error('no canvas')
  const box = stage.getBoundingClientRect()
  const from = centre(node)
  finger(node, 'pointerdown', from)
  await wait(HOLD_TO_DRAG_MS + 100)
  await vi.waitFor(() => expect(dragging()).toBe('Some'))
  finger(document.body, 'pointermove', { clientX: from.clientX, clientY: box.bottom - 6 })
  await vi.waitFor(() => expect(stage.scrollTop).toBeGreaterThan(20))
  finger(document.body, 'pointercancel', from)
})

it('keeps the grip reachable: above the node where there is room, inside its top edge under a sticky bar or at the top of the scrolling box', async () => {
  // A bar over the top of the window, declared to the page by its `scroll-padding-top`.
  mounted = mountBuilder(
    undefined,
    'html { scroll-padding-top: 90px; } #bar { position: fixed; top: 0; left: 0; right: 0; height: 90px; background: #ccc; z-index: 5; }',
  )
  const bar = document.createElement('div')
  bar.id = 'bar'
  document.body.append(bar)
  await ready()
  const handle = () =>
    document.querySelector<HTMLElement>(
      '[data-builder-canvas] > [data-grip-place], [data-builder-canvas] > div:has([data-builder-handle])',
    )
  const reachable = () => {
    const at = centre(grip() ?? document.body)
    return document.elementFromPoint(at.clientX, at.clientY) === grip()
  }
  // Mid-page, a node has room above it.
  await select('h4')
  const node = boxOfNode('h4')
  node?.scrollIntoView({ block: 'center' })
  await vi.waitFor(() => expect(handle()?.hasAttribute('data-grip-place')).toBe(false))
  expect(reachable()).toBe(true)
  // At the top of the box that scrolls, none: the grip would sit above it, cut off.
  await select('h0')
  canvas()?.scrollTo({ top: 0 })
  window.scrollTo({ top: 0 })
  await vi.waitFor(() => expect(handle()?.getAttribute('data-grip-place')).toBe('inside'))
  expect(reachable()).toBe(true)
})

it('reads the page’s scroll-padding for room above a node when the page itself scrolls', async () => {
  mounted = mountBuilder(
    undefined,
    'html { scroll-padding-top: 90px; } #bar { position: fixed; top: 0; left: 0; right: 0; height: 90px; background: #ccc; z-index: 5; } [data-builder-canvas] { height: auto; overflow: visible; } section[data-panel="layers"], nav[data-panel="insert"] { display: none; } body::after { content: ""; display: block; height: 3000px; }',
  )
  const bar = document.createElement('div')
  bar.id = 'bar'
  document.body.append(bar)
  await ready()
  await select('h2')
  const place = () =>
    document
      .querySelector('[data-builder-canvas] > div:has([data-builder-handle])')
      ?.getAttribute('data-grip-place')
  const topAt = async (top: number) => {
    window.scrollBy(0, (boxOfNode('h2')?.getBoundingClientRect().top ?? 0) - top)
    await frame()
  }
  // Its top 100px down: under the bar's 90px the grip's 44px would be cut off.
  await topAt(100)
  await vi.waitFor(() => expect(place()).toBe('inside'))
  const at = centre(grip() ?? document.body)
  expect(document.elementFromPoint(at.clientX, at.clientY)).toBe(grip())
  await topAt(300)
  await vi.waitFor(() => expect(place()).toBeNull())
})
