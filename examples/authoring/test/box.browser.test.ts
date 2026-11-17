/// <reference types="@vitest/browser-playwright" />
/**
 * The box on a real page, read from its layout: Alt with an arrow nudges it by
 * the grid and it stops at the bounds, the handle's keys resize it within them,
 * a pointer drag lands on the grid, and Escape in the middle of a drag puts the
 * starting rectangle back.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { Frames } from 'foldkit-mixins/testing'
import { AREA, GRID, MIN } from '../src/box/app.js'
import { mountBox } from '../src/box/mount.js'
import { pageStylesheet } from '../src/style.js'

let handle: { readonly dispose: () => void } | undefined
let frames: ReturnType<typeof Frames.track> | undefined

beforeEach(async () => {
  Style.install(pageStylesheet)
  frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'box-host'
  document.body.appendChild(container)
  handle = mountBox(container)
  await vi.waitFor(() => expect(box()).not.toBeNull())
})

afterEach(() => {
  handle?.dispose()
  handle = undefined
  frames?.dispose()
  frames = undefined
  document.body.replaceChildren()
})

const box = () => document.querySelector<HTMLElement>('button[aria-label="Box"]')!
const grip = () => document.querySelector<HTMLElement>('button[aria-label="Resize the box"]')!
const area = () => box().parentElement!

/** The box as the page lays it out, in the area's own coordinates. */
const placed = () => {
  const inner = area().getBoundingClientRect()
  const outer = box().getBoundingClientRect()
  return {
    x: outer.left - inner.left - area().clientLeft,
    y: outer.top - inner.top - area().clientTop,
    width: outer.width,
    height: outer.height,
  }
}

const START = { x: 60, y: 40, width: 100, height: 80 }

/** A key meets the page as last drawn, so each press waits for the frame the one before caused. */
const press = async (keys: string) => {
  await userEvent.keyboard(keys)
  await frames?.settle()
}
const nudge = (arrow: string, large = false) =>
  press(`{Alt>}${large ? '{Shift>}' : ''}{${arrow}}${large ? '{/Shift}' : ''}{/Alt}`)

test('starts where the Model puts it, inside an area drawn at the bounds', () => {
  expect(placed()).toEqual(START)
  expect(area().clientWidth).toBe(AREA.right - AREA.left)
  expect(area().clientHeight).toBe(AREA.bottom - AREA.top)
})

test('Alt with an arrow nudges by the grid step, and Alt+Shift by ten', async () => {
  box().focus()
  await nudge('ArrowRight')
  await vi.waitFor(() => expect(placed().x).toBe(START.x + GRID))
  await nudge('ArrowDown')
  await vi.waitFor(() => expect(placed().y).toBe(START.y + GRID))
  await nudge('ArrowLeft', true)
  await vi.waitFor(() => expect(placed().x).toBe(0))
  // A plain arrow is not a nudge.
  const before = placed()
  await press('{ArrowRight}')
  expect(placed()).toEqual(before)
})

test('the box stops at each bound and keeps its size there', async () => {
  box().focus()
  await nudge('ArrowRight', true)
  await nudge('ArrowRight', true)
  await vi.waitFor(() => expect(placed().x).toBe(AREA.right - START.width))
  await nudge('ArrowDown', true)
  await nudge('ArrowDown', true)
  await vi.waitFor(() => expect(placed().y).toBe(AREA.bottom - START.height))
  await nudge('ArrowRight')
  await nudge('ArrowDown')
  expect(placed()).toEqual({
    x: AREA.right - START.width,
    y: AREA.bottom - START.height,
    width: START.width,
    height: START.height,
  })
  await nudge('ArrowLeft', true)
  await nudge('ArrowLeft', true)
  await nudge('ArrowUp', true)
  await nudge('ArrowUp', true)
  await vi.waitFor(() => expect(placed()).toMatchObject({ x: 0, y: 0 }))
})

test('the handle resizes by the grid, within the area and above the smallest size', async () => {
  grip().focus()
  await press('{ArrowRight}')
  await vi.waitFor(() => expect(placed().width).toBe(START.width + GRID))
  await press('{ArrowDown}')
  await vi.waitFor(() => expect(placed().height).toBe(START.height + GRID))
  expect(placed()).toMatchObject({ x: START.x, y: START.y })
  await press('{End}')
  await vi.waitFor(() =>
    expect(placed()).toEqual({
      x: START.x,
      y: START.y,
      width: AREA.right - START.x,
      height: AREA.bottom - START.y,
    }),
  )
  await press('{Home}')
  await vi.waitFor(() => expect(placed()).toMatchObject({ width: MIN.width, height: MIN.height }))
  // Nothing smaller, and the handle's keys leave the box where it is.
  await press('{ArrowLeft}')
  expect(placed()).toEqual({ x: START.x, y: START.y, width: MIN.width, height: MIN.height })
})

test('a pointer drag lands on the grid, not where the pointer stopped', async () => {
  const from = { x: START.x + START.width / 2, y: START.y + START.height / 2 }
  const inset = area().clientLeft
  await userEvent.dragAndDrop(box(), area(), {
    sourcePosition: { x: START.width / 2, y: START.height / 2 },
    targetPosition: { x: from.x + 35 + inset, y: from.y + 25 + inset },
  })
  // 35 and 25 are not on the grid; 95 and 65 snap to 100 and 60.
  await vi.waitFor(() => expect(placed()).toEqual({ ...START, x: 100, y: 60 }))
})

test('a pointer drag stops at the bounds', async () => {
  const inset = area().clientLeft
  await userEvent.dragAndDrop(box(), area(), {
    sourcePosition: { x: 10, y: 10 },
    // Clear of the area's rounded corner: a point 2px in from both edges lies outside an 8px
    // corner, so the release went to the element behind and the drop never came. From 12px in,
    // the box, held 10px from its own corner, still runs past both bounds.
    targetPosition: { x: AREA.right + inset - 12, y: AREA.bottom + inset - 12 },
  })
  await vi.waitFor(() =>
    expect(placed()).toEqual({
      ...START,
      x: AREA.right - START.width,
      y: AREA.bottom - START.height,
    }),
  )
})

test('dragging the handle resizes on the same grid', async () => {
  const inset = area().clientLeft
  await userEvent.dragAndDrop(grip(), area(), {
    targetPosition: {
      x: START.x + START.width + 45 + inset,
      y: START.y + START.height + 25 + inset,
    },
  })
  // The south-east corner goes to 205, 145: on the grid, 200, 140.
  await vi.waitFor(() => expect(placed()).toEqual({ ...START, width: 140, height: 100 }))
})

/**
 * A real pointer cannot be held across a keypress here, so the press and the
 * moves are dispatched at the element, as the primitive's own tests do; the
 * Escape is a real key.
 */
const pointer = (target: HTMLElement, type: string, dx: number, dy: number) => {
  const at = target.getBoundingClientRect()
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: at.left + at.width / 2 + dx,
      clientY: at.top + at.height / 2 + dy,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    }),
  )
}

test('Escape in the middle of a move puts the starting rectangle back', async () => {
  pointer(box(), 'pointerdown', 0, 0)
  pointer(box(), 'pointermove', 35, 25)
  await vi.waitFor(() => expect(placed()).toEqual({ ...START, x: 100, y: 60 }))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(placed()).toEqual(START))
  // The release after it is no part of a drag, and later moves find none.
  pointer(box(), 'pointermove', 80, 80)
  pointer(box(), 'pointerup', 80, 80)
  await frames?.settle()
  expect(placed()).toEqual(START)
})

test('Escape in the middle of a resize puts the starting size back', async () => {
  pointer(grip(), 'pointerdown', 0, 0)
  pointer(grip(), 'pointermove', 45, 25)
  await vi.waitFor(() => expect(placed()).toEqual({ ...START, width: 140, height: 100 }))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(placed()).toEqual(START))
})
