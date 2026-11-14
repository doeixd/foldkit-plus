/// <reference types="@vitest/browser-playwright" />
/**
 * Edge scrolling while a drag is held, in a real page: a drag held near the
 * edge of the box that scrolls moves it on a clock and reports the place under
 * the still pointer, and nothing outlives the drag. Pointer events are
 * dispatched at the element under each point, as a mouse's are.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { cdp } from 'vitest/browser'
import { afterEach, expect, it, vi } from 'vitest'
import { type DragFact, PointerDrag } from '../src/dom/pointer-drag.js'

afterEach(async () => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
  document.documentElement.style.scrollBehavior = ''
  await cdp().send('Emulation.setEmulatedMedia', { features: [] })
})

const later = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const until = async (check: () => boolean, ms = 3000) => {
  for (let waited = 0; !check() && waited < ms; waited += 20) await later(20)
}

const pointer = (x: number, y: number, type: string) =>
  (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    }),
  )

const drive = (container: HTMLElement, options: Parameters<typeof PointerDrag>[0]) => {
  const facts: Array<DragFact> = []
  const fiber = Effect.runFork(
    Stream.runForEach(PointerDrag(options).f(container, liveViewStateChanges), fact =>
      Effect.sync(() => void facts.push(fact)),
    ),
  )
  return { facts, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) }
}

/** Marked rows of 30px in a list; the box shows 100px of them, and sits at the page's top left. */
const rows = (count: number, boxStyle = 'height:100px;overflow:auto') => {
  const box = document.createElement('div')
  box.style.cssText = `position:absolute;left:0;top:0;width:200px;${boxStyle}`
  const list = document.createElement('ul')
  list.style.cssText = 'margin:0;padding:0'
  for (let at = 0; at < count; at++) {
    const row = document.createElement('li')
    row.dataset['row'] = `r${at}`
    row.style.cssText = 'height:30px;box-sizing:border-box;margin:0;padding:0;list-style:none'
    row.textContent = `row ${at}`
    list.append(row)
  }
  box.append(list)
  document.body.append(box)
  return { box, list }
}

/** Presses the first row, moves into the box, then holds the pointer at `y`. */
const holdAt = (y: number) => {
  pointer(10, 15, 'pointerdown')
  pointer(10, 40, 'pointermove')
  pointer(10, y, 'pointermove')
}

it('scrolls the box while a drag is held at its bottom edge, and reports the row under the pointer', async () => {
  const { box, list } = rows(20)
  const run = drive(list, { attribute: 'data-row', edgeScroll: {} })
  try {
    await later(20)
    holdAt(98)
    await until(() => box.scrollTop > 100)
    expect(box.scrollTop).toBeGreaterThan(100)
    // The pointer never moved again: the place changed because the list did.
    const last = run.facts.filter(fact => fact._tag === 'DraggedOver').at(-1)
    expect(last).toMatchObject({ over: { id: expect.stringMatching(/^r(?!1$|2$|3$)\d+$/) } })
    pointer(10, 98, 'pointerup')
  } finally {
    await run.stop()
  }
})

it('scrolls back up from the top edge', async () => {
  const { box, list } = rows(20)
  const run = drive(list, { attribute: 'data-row', edgeScroll: {} })
  try {
    await later(20)
    box.scrollTop = 300
    pointer(10, 40, 'pointerdown')
    pointer(10, 60, 'pointermove')
    pointer(10, 2, 'pointermove')
    await until(() => box.scrollTop < 200)
    expect(box.scrollTop).toBeLessThan(200)
    pointer(10, 2, 'pointerup')
  } finally {
    await run.stop()
  }
})

it('scrolls nothing without the option, nothing while the pointer is mid-box, and nothing after the release', async () => {
  const plain = rows(20)
  const without = drive(plain.list, { attribute: 'data-row' })
  try {
    await later(20)
    holdAt(98)
    await later(300)
    expect(plain.box.scrollTop).toBe(0)
    pointer(10, 98, 'pointerup')
  } finally {
    await without.stop()
  }
  document.body.replaceChildren()
  const { box, list } = rows(20)
  const run = drive(list, { attribute: 'data-row', edgeScroll: {} })
  try {
    await later(20)
    holdAt(50)
    await later(300)
    expect(box.scrollTop).toBe(0)
    pointer(10, 98, 'pointermove')
    await until(() => box.scrollTop > 0)
    expect(box.scrollTop).toBeGreaterThan(0)
    pointer(10, 98, 'pointerup')
    const at = box.scrollTop
    await later(200)
    expect(box.scrollTop).toBe(at)
  } finally {
    await run.stop()
  }
})

it('scrolls faster the deeper the pointer is in the strip', async () => {
  const tall = 'height:300px;overflow:auto'
  const shallow = rows(60, tall)
  const slow = drive(shallow.list, { attribute: 'data-row', edgeScroll: { edge: 60 } })
  let slower = 0
  try {
    await later(20)
    pointer(10, 15, 'pointerdown')
    pointer(10, 100, 'pointermove')
    pointer(10, 250, 'pointermove')
    await later(400)
    slower = shallow.box.scrollTop
    pointer(10, 250, 'pointerup')
  } finally {
    await slow.stop()
  }
  document.body.replaceChildren()
  const deep = rows(60, tall)
  const fast = drive(deep.list, { attribute: 'data-row', edgeScroll: { edge: 60 } })
  try {
    await later(20)
    pointer(10, 15, 'pointerdown')
    pointer(10, 100, 'pointermove')
    pointer(10, 299, 'pointermove')
    await later(400)
    expect(slower).toBeGreaterThan(0)
    expect(deep.box.scrollTop).toBeGreaterThan(slower * 2)
    pointer(10, 299, 'pointerup')
  } finally {
    await fast.stop()
  }
})

it('stops at the end of the list and asks for no more frames', async () => {
  const { box, list } = rows(6)
  const run = drive(list, { attribute: 'data-row', edgeScroll: {} })
  try {
    await later(20)
    holdAt(98)
    await until(() => box.scrollTop >= 80)
    expect(box.scrollTop).toBe(80)
    await later(100)
    const frames = vi.spyOn(window, 'requestAnimationFrame')
    await later(200)
    expect(frames).not.toHaveBeenCalled()
    pointer(10, 98, 'pointerup')
  } finally {
    await run.stop()
  }
})

it('scrolls the page when no ancestor does, and the nearest ancestor first when several can', async () => {
  const { list } = rows(4, 'height:120px')
  list.parentElement!.style.position = 'relative'
  const spacer = document.createElement('div')
  spacer.style.cssText = 'height:3000px'
  document.body.append(spacer)
  const run = drive(list, { attribute: 'data-row', edgeScroll: {} })
  try {
    await later(20)
    const bottom = document.documentElement.clientHeight - 3
    pointer(10, 15, 'pointerdown')
    pointer(10, 40, 'pointermove')
    pointer(10, bottom, 'pointermove')
    await until(() => window.scrollY > 100)
    expect(window.scrollY).toBeGreaterThan(100)
    pointer(10, bottom, 'pointerup')
  } finally {
    await run.stop()
  }
  window.scrollTo(0, 0)
})

it('hands over to the page once the box it scrolls is at its end', async () => {
  const { box, list } = rows(8, 'height:100px;overflow:auto')
  box.style.top = `${document.documentElement.clientHeight - 100}px`
  const spacer = document.createElement('div')
  spacer.style.cssText = 'height:3000px'
  document.body.append(spacer)
  const run = drive(list, { attribute: 'data-row', edgeScroll: {} })
  try {
    await later(20)
    const top = document.documentElement.clientHeight - 100
    const bottom = document.documentElement.clientHeight - 2
    pointer(10, top + 15, 'pointerdown')
    pointer(10, top + 40, 'pointermove')
    pointer(10, bottom, 'pointermove')
    await until(() => window.scrollY > 50)
    expect(box.scrollTop).toBe(8 * 30 - 100)
    expect(window.scrollY).toBeGreaterThan(50)
    pointer(10, bottom, 'pointerup')
  } finally {
    await run.stop()
    window.scrollTo(0, 0)
  }
})

it('ignores a page that glides: each step lands at once', async () => {
  document.documentElement.style.scrollBehavior = 'smooth'
  const { box, list } = rows(40, 'height:100px;overflow:auto;scroll-behavior:smooth')
  const run = drive(list, { attribute: 'data-row', edgeScroll: { speed: 3000 } })
  try {
    await later(20)
    holdAt(99)
    await later(400)
    // A glide restarted every frame would still be near the start.
    expect(box.scrollTop).toBeGreaterThan(600)
    pointer(10, 99, 'pointerup')
  } finally {
    await run.stop()
  }
})

it('moves in jumps under reduced motion, not a glide', async () => {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  const { box, list } = rows(60)
  const run = drive(list, { attribute: 'data-row', edgeScroll: {} })
  const seen = new Set<number>()
  try {
    await later(20)
    holdAt(98)
    const stopAt = performance.now() + 700
    while (performance.now() < stopAt) {
      seen.add(box.scrollTop)
      await later(5)
    }
    pointer(10, 98, 'pointerup')
    // About four jumps in 700ms at one every 150ms; a glide shows a new offset every frame.
    expect(seen.size).toBeGreaterThan(2)
    expect(seen.size).toBeLessThan(9)
  } finally {
    await run.stop()
  }
})

it('ends the loop when the drag is cancelled with Escape or the Mount stops', async () => {
  const { box, list } = rows(60)
  const run = drive(list, { attribute: 'data-row', edgeScroll: {} })
  try {
    await later(20)
    holdAt(98)
    await until(() => box.scrollTop > 30)
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await later(50)
    const at = box.scrollTop
    await later(200)
    expect(box.scrollTop).toBe(at)
    holdAt(98)
    await until(() => box.scrollTop > at + 30)
  } finally {
    await run.stop()
  }
  const at = box.scrollTop
  await later(200)
  expect(box.scrollTop).toBe(at)
})
