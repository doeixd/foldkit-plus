/**
 * `ScrollBars` in a real browser, where a box scrolls: the thumb is as long
 * as the view is of the content and moves with the scroll, the bars show
 * while it scrolls and hide once idle, a press on a bar drags, and a coarse
 * pointer gets nothing.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { ScrollBars, scrollThumb } from '../src/dom/scroll-bars.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/**
 * A 100px square box over 400px of content each way, with a 100px bar along
 * each edge beside it, as a style lays them over the box.
 */
const mount = async (options: { readonly idle?: number; readonly dir?: 'rtl' } = {}) => {
  const area = document.createElement('div')
  area.style.cssText = 'position: relative; width: 100px; height: 100px'
  if (options.dir !== undefined) area.dir = options.dir
  const scroller = document.createElement('div')
  scroller.style.cssText = 'width: 100px; height: 100px; overflow: auto; scrollbar-width: none'
  const content = document.createElement('div')
  content.style.cssText = 'width: 400px; height: 400px'
  scroller.append(content)
  const bar = (axis: 'block' | 'inline') => {
    const element = document.createElement('div')
    element.setAttribute('data-scroll-bar', axis)
    element.style.cssText =
      axis === 'block'
        ? 'position: absolute; top: 0; right: 0; width: 10px; height: 100px'
        : 'position: absolute; left: 0; bottom: 0; width: 100px; height: 10px'
    return element
  }
  const block = bar('block')
  const inline = bar('inline')
  area.append(scroller, block, inline)
  document.body.append(area)
  const fiber = Effect.runFork(
    Stream.runDrain(
      ScrollBars(options.idle === undefined ? {} : { idle: options.idle }).f(
        scroller,
        liveViewStateChanges,
      ),
    ),
  )
  const thumb = (element: HTMLElement) => [
    element.style.getPropertyValue(scrollThumb.offset),
    element.style.getPropertyValue(scrollThumb.size),
  ]
  const press = (type: string, element: Element, x: number, y: number) => {
    const box = element.getBoundingClientRect()
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: box.left + x,
        clientY: box.top + y,
      }),
    )
  }
  const stop = () => Effect.runPromise(Fiber.interrupt(fiber))
  await vi.waitFor(() => expect(scroller.hasAttribute('data-scroll-overlaid')).toBe(true))
  return { area, scroller, content, block, inline, thumb, press, stop }
}

it('sizes the thumb by the view and moves it with the scroll', async () => {
  const bars = await mount()
  try {
    expect(bars.block.hasAttribute('data-scrollable')).toBe(true)
    // A 100px view of 400px is a quarter of the 100px bar.
    expect(bars.thumb(bars.block)).toEqual(['0px', '25px'])
    bars.scroller.scrollTop = 150
    // Half of the 300px it can scroll, along the 75px the thumb can travel.
    await vi.waitFor(() => expect(bars.thumb(bars.block)).toEqual(['37.5px', '25px']))
    bars.scroller.scrollLeft = 300
    await vi.waitFor(() => expect(bars.thumb(bars.inline)).toEqual(['75px', '25px']))
  } finally {
    await bars.stop()
  }
})

it('marks no bar scrollable for an axis with nothing past the view', async () => {
  const bars = await mount()
  try {
    bars.content.style.height = '50px'
    await vi.waitFor(() => expect(bars.block.hasAttribute('data-scrollable')).toBe(false))
    expect(bars.inline.hasAttribute('data-scrollable')).toBe(true)
  } finally {
    await bars.stop()
  }
})

it('follows content that grows, and an element added, without a scroll', async () => {
  const bars = await mount()
  try {
    bars.content.style.height = '200px'
    await vi.waitFor(() => expect(bars.thumb(bars.block)).toEqual(['0px', '50px']))
    const more = document.createElement('div')
    more.style.cssText = 'height: 200px'
    bars.scroller.append(more)
    await vi.waitFor(() => expect(bars.thumb(bars.block)).toEqual(['0px', '25px']))
    // The added element is watched for its size too. 100 of 2000 is 5px, under
    // the 20px a thumb keeps as a target.
    more.style.height = '1800px'
    await vi.waitFor(() => expect(bars.thumb(bars.block)).toEqual(['0px', '20px']))
  } finally {
    await bars.stop()
  }
})

it('watches what is in the box as it changes, and only what changed', async () => {
  const watched = new Set<Element>()
  let observed = 0
  vi.spyOn(ResizeObserver.prototype, 'observe').mockImplementation(target => {
    observed += 1
    watched.add(target)
  })
  vi.spyOn(ResizeObserver.prototype, 'unobserve').mockImplementation(target => {
    watched.delete(target)
  })
  vi.spyOn(ResizeObserver.prototype, 'disconnect').mockImplementation(() => watched.clear())
  const bars = await mount()
  try {
    const rows = Array.from({ length: 10 }, () => document.createElement('div'))
    bars.scroller.append(...rows)
    await new Promise(requestAnimationFrame)
    const before = observed
    // As a virtual list scrolls: a row leaves one end and one comes in at the other, a frame apart.
    for (let step = 0; step < 5; step++) {
      bars.scroller.firstElementChild?.remove()
      bars.scroller.append(document.createElement('div'))
      await new Promise(requestAnimationFrame)
    }
    expect(observed - before).toBe(5)
    expect(watched).toEqual(
      new Set([bars.scroller, ...bars.scroller.children, bars.block, bars.inline]),
    )
  } finally {
    await bars.stop()
  }
})

it('shows the bars while the box scrolls, and hides them once idle', async () => {
  // Long enough for `waitFor`'s polling to see them shown.
  const bars = await mount({ idle: 200 })
  try {
    expect(bars.block.hasAttribute('data-shown')).toBe(false)
    bars.scroller.scrollTop = 50
    await vi.waitFor(() => expect(bars.block.hasAttribute('data-shown')).toBe(true))
    expect(bars.inline.hasAttribute('data-shown')).toBe(true)
    await vi.waitFor(() => expect(bars.block.hasAttribute('data-shown')).toBe(false))
  } finally {
    await bars.stop()
  }
})

it('keeps the bars while the pointer rests on one, and hides them once it leaves', async () => {
  const bars = await mount({ idle: 40 })
  try {
    bars.press('pointerenter', bars.area, 95, 50)
    bars.press('pointerover', bars.block, 5, 50)
    await vi.waitFor(() => expect(bars.block.hasAttribute('data-shown')).toBe(true))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(bars.block.hasAttribute('data-shown')).toBe(true)
    bars.area.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
    await vi.waitFor(() => expect(bars.block.hasAttribute('data-shown')).toBe(false))
  } finally {
    await bars.stop()
  }
})

it('drags the thumb, holding it where it was taken', async () => {
  const bars = await mount()
  try {
    // The thumb spans 0 to 25px; taken 10px down it, then moved 30px.
    bars.press('pointerdown', bars.block, 5, 10)
    expect(bars.block.hasAttribute('data-dragging')).toBe(true)
    bars.press('pointermove', bars.block, 5, 40)
    // 30px of the 75px it can travel is 120px of the 300px the box can scroll.
    expect(bars.scroller.scrollTop).toBe(120)
    bars.press('pointerup', bars.block, 5, 40)
    expect(bars.block.hasAttribute('data-dragging')).toBe(false)
    bars.press('pointermove', bars.block, 5, 90)
    expect(bars.scroller.scrollTop).toBe(120)
  } finally {
    await bars.stop()
  }
})

it('jumps the thumb to a press off it, centred there', async () => {
  const bars = await mount()
  try {
    // At 50px the thumb's middle lands: it starts at 37.5px, half its travel.
    bars.press('pointerdown', bars.block, 5, 50)
    expect(bars.scroller.scrollTop).toBe(150)
    bars.press('pointerup', bars.block, 5, 50)
  } finally {
    await bars.stop()
  }
})

it('places a right-to-left inline thumb from the right, where the scroll starts', async () => {
  const bars = await mount({ dir: 'rtl' })
  try {
    expect(bars.thumb(bars.inline)).toEqual(['75px', '25px'])
    bars.scroller.scrollLeft = -300
    await vi.waitFor(() => expect(bars.thumb(bars.inline)).toEqual(['0px', '25px']))
  } finally {
    await bars.stop()
  }
})

it('leaves the browser its bar on a coarse pointer', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    query => ({ matches: false, media: query }) as MediaQueryList,
  )
  const scroller = document.createElement('div')
  const bar = document.createElement('div')
  bar.setAttribute('data-scroll-bar', 'block')
  const area = document.createElement('div')
  area.append(scroller, bar)
  document.body.append(area)
  const fiber = Effect.runFork(Stream.runDrain(ScrollBars({}).f(scroller, liveViewStateChanges)))
  try {
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(window.matchMedia).toHaveBeenCalledWith('(hover: hover) and (pointer: fine)')
    expect(scroller.hasAttribute('data-scroll-overlaid')).toBe(false)
    expect(bar.hasAttribute('data-scrollable')).toBe(false)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('takes back everything it marked when it ends', async () => {
  const bars = await mount()
  bars.scroller.scrollTop = 50
  await vi.waitFor(() => expect(bars.block.hasAttribute('data-shown')).toBe(true))
  await bars.stop()
  expect(bars.scroller.hasAttribute('data-scroll-overlaid')).toBe(false)
  expect(bars.block.hasAttribute('data-scrollable')).toBe(false)
  expect(bars.block.hasAttribute('data-shown')).toBe(false)
  expect(bars.thumb(bars.block)).toEqual(['', ''])
  // Nothing it left behind writes again.
  bars.scroller.scrollTop = 150
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(bars.thumb(bars.block)).toEqual(['', ''])
})
