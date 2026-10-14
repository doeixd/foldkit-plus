/**
 * `FluidHover` in a real browser, where items have places: the highlight goes
 * to the item nearest the pointer, gaps included, and never to a disabled one.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { type FluidAxis, FluidHover, fluidHovered } from '../src/dom/fluid-hover.js'

afterEach(() => {
  document.body.innerHTML = ''
})

const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

/**
 * Items 40px tall and 100px wide with 20px gaps, in `columns` columns, each
 * holding a button marked as what a press in a gap reaches.
 */
const mount = async (
  options: {
    columns?: number
    axis?: FluidAxis
    disabled?: number
    narrow?: number
    follows?: string
    from?: string
    chosen?: number
  } = {},
) => {
  const columns = options.columns ?? 1
  const container = document.createElement('div')
  container.style.cssText = `position: relative; display: grid; gap: 20px; grid-template-columns: repeat(${columns}, 100px); width: max-content; padding: 10px`
  const presses: Array<number> = []
  for (const index of [0, 1, 2, 3]) {
    const item = document.createElement('div')
    item.dataset['item'] = String(index)
    item.style.height = '40px'
    if (index === options.narrow) item.style.width = '30px'
    if (index === options.disabled) item.setAttribute('aria-disabled', 'true')
    if (index === options.chosen) item.setAttribute('data-chosen', '')
    const button = document.createElement('button')
    button.textContent = `Item ${index}`
    button.setAttribute('data-fluid-press', '')
    button.addEventListener('click', () => presses.push(index))
    item.appendChild(button)
    container.appendChild(item)
  }
  document.body.appendChild(container)
  const fiber = Effect.runFork(
    Stream.runDrain(
      FluidHover({
        name: 'hover',
        item: '[data-item]',
        axis: options.axis ?? 'y',
        gapClick: true,
        ...(options.follows === undefined ? {} : { follows: options.follows }),
        ...(options.from === undefined ? {} : { from: options.from }),
      }).f(container, liveViewStateChanges),
    ),
  )
  const items = Array.from(container.children) as Array<HTMLElement>
  const read = (part: keyof ReturnType<typeof fluidHovered>) =>
    container.style.getPropertyValue(fluidHovered('hover')[part])
  /** Where the highlight is, as the item it covers. */
  const highlighted = () =>
    items.findIndex(
      item =>
        `${item.offsetTop}px` === read('y') &&
        `${item.offsetLeft}px` === read('x') &&
        read('shown') === '1',
    )
  const point = (x: number, y: number, pointerType = 'mouse') => {
    const box = container.getBoundingClientRect()
    container.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: box.left + x,
        clientY: box.top + y,
        pointerType,
      }),
    )
  }
  const stop = () => Effect.runPromise(Fiber.interrupt(fiber))
  // The Mount starts after this returns: a pointer moved before it listens is missed.
  await vi.waitFor(() => expect(read('shown')).toBe('0'))
  return { container, items, read, highlighted, point, presses, stop }
}

it('highlights the item under the pointer, and the nearer one from a gap', async () => {
  const hover = await mount()
  try {
    expect(hover.container.getAttribute('data-fluid-hover')).toBe('hover')
    // Item 1 spans 70..110; item 2 130..170; the gap between is 110..130.
    hover.point(50, 90)
    await vi.waitFor(() => expect(hover.highlighted()).toBe(1))
    expect(hover.read('h')).toBe('40px')
    hover.point(50, 125)
    await vi.waitFor(() => expect(hover.highlighted()).toBe(2))
    hover.point(50, 114)
    await vi.waitFor(() => expect(hover.highlighted()).toBe(1))
  } finally {
    await hover.stop()
  }
})

it('passes over a disabled item to the nearest enabled one', async () => {
  const hover = await mount({ disabled: 1 })
  try {
    // On disabled item 1 (70..110): 25px from item 0's edge, 55px from item 2's.
    hover.point(50, 75)
    await vi.waitFor(() => expect(hover.highlighted()).toBe(0))
    hover.point(50, 105)
    await vi.waitFor(() => expect(hover.highlighted()).toBe(2))
  } finally {
    await hover.stop()
  }
})

it('reads both axes in a grid', async () => {
  const grid = await mount({ columns: 2, axis: 'xy' })
  try {
    // Items 0 1 / 2 3, columns at 10..110 and 130..230, rows at 10..50 and
    // 70..110: the point is in the corner gap, 7px from item 3's corner and
    // 15px from the edges of items 1 and 2.
    grid.point(125, 65)
    await vi.waitFor(() => expect(grid.highlighted()).toBe(3))
  } finally {
    await grid.stop()
  }
})

it('keeps a list to the row level with the pointer, and a grid to the nearest item', async () => {
  // Item 1 is 30px wide (10..40); the point is 6px above it and 60px to its
  // right, and 14px below item 0, which spans the whole width.
  const list = await mount({ narrow: 1 })
  try {
    list.point(100, 64)
    await vi.waitFor(() => expect(list.highlighted()).toBe(1))
  } finally {
    await list.stop()
  }
  const grid = await mount({ narrow: 1, axis: 'xy' })
  try {
    grid.point(100, 64)
    await vi.waitFor(() => expect(grid.highlighted()).toBe(0))
  } finally {
    await grid.stop()
  }
})

it('appears without moving, then moves, and hides when the pointer leaves', async () => {
  const hover = await mount()
  try {
    hover.point(50, 30)
    // The frame the pointer is followed in: shown, on its item, without moving.
    await frame()
    expect([hover.read('shown'), hover.read('moving')]).toEqual(['1', '0'])
    await frame()
    expect(hover.read('moving')).toBe('1')
    hover.container.dispatchEvent(new PointerEvent('pointerleave'))
    expect(hover.read('shown')).toBe('0')
    // Where it was, so it fades in place.
    expect(hover.read('y')).toBe('10px')
  } finally {
    await hover.stop()
  }
})

it('follows no touch', async () => {
  const hover = await mount()
  try {
    hover.point(50, 30, 'touch')
    await frame()
    await frame()
    expect(hover.read('shown')).toBe('0')
  } finally {
    await hover.stop()
  }
})

it('presses the highlighted item from a gap, and nothing from the item itself', async () => {
  const hover = await mount()
  try {
    hover.point(50, 125)
    await vi.waitFor(() => expect(hover.highlighted()).toBe(2))
    hover.container.click()
    expect(hover.presses).toEqual([2])
    hover.items[2]!.querySelector('button')!.click()
    expect(hover.presses).toEqual([2, 2])
    // A click on an item, beside its control, is the item's own: no press.
    hover.items[2]!.click()
    expect(hover.presses).toEqual([2, 2])
  } finally {
    await hover.stop()
  }
})

it('follows the keyboard to the item holding focus', async () => {
  const hover = await mount()
  try {
    await userEvent.tab()
    await userEvent.tab()
    await vi.waitFor(() => expect(hover.highlighted()).toBe(1))
  } finally {
    await hover.stop()
  }
})

it('sits on the item its mark moves to while the pointer is away, and fades when the mark goes', async () => {
  const hover = await mount({ follows: '[data-active]' })
  try {
    hover.items[2]!.setAttribute('data-active', '')
    await vi.waitFor(() => expect(hover.highlighted()).toBe(2))
    hover.items[2]!.removeAttribute('data-active')
    hover.items[3]!.setAttribute('data-active', '')
    await vi.waitFor(() => expect(hover.highlighted()).toBe(3))
    hover.items[3]!.removeAttribute('data-active')
    await vi.waitFor(() => expect(hover.read('shown')).toBe('0'))
  } finally {
    await hover.stop()
  }
})

it('grows out of the chosen item and returns to it as it fades', async () => {
  const hover = await mount({ from: '[data-chosen]', chosen: 0 })
  try {
    const chosen = `${hover.items[0]!.offsetTop}px`
    const places: Array<string> = []
    const record = new MutationObserver(() => {
      const y = hover.read('y')
      if (places.at(-1) !== y) places.push(y)
    })
    record.observe(hover.container, { attributes: true, attributeFilter: ['style'] })
    hover.point(50, 150)
    await vi.waitFor(() => expect(hover.highlighted()).toBe(2))
    record.disconnect()
    // Drawn on the chosen item first, then moved out to the one pointed at.
    expect(places).toEqual([chosen, `${hover.items[2]!.offsetTop}px`])
    hover.container.dispatchEvent(new PointerEvent('pointerleave'))
    expect(hover.read('y')).toBe(chosen)
    expect(hover.read('shown')).toBe('0')
  } finally {
    await hover.stop()
  }
})
