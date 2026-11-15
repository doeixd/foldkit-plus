/// <reference types="@vitest/browser-playwright" />
/**
 * `Marquee` in a real page: a canvas of marked nodes at known places, a lasso
 * dragged over them with pointer events dispatched at the element under each
 * point (as a mouse's are). The claims are about geometry (the rectangle in
 * content coordinates, which nodes it touches, a scrolled container) and about
 * which presses are the lasso's and which are not.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { type DragFact, PointerDrag } from '../src/dom/pointer-drag.js'
import { Marquee, type MarqueeFact } from '../src/dom/marquee.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
  window.scrollTo(0, 0)
})

const later = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const until = async (check: () => boolean, ms = 3000) => {
  for (let waited = 0; !check() && waited < ms; waited += 20) await later(20)
}

const pointer = (
  x: number,
  y: number,
  type: string,
  extra: PointerEventInit = {},
  at: EventTarget = document.elementFromPoint(x, y) ?? document.body,
) =>
  at.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      ...extra,
    }),
  )

const drive = (container: HTMLElement, options: Parameters<typeof Marquee>[0]) => {
  const facts: Array<MarqueeFact> = []
  const fiber = Effect.runFork(
    Stream.runForEach(Marquee(options).f(container, liveViewStateChanges), fact =>
      Effect.sync(() => void facts.push(fact)),
    ),
  )
  return { facts, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) }
}

/**
 * A 300 by 200 canvas at 100, 50 behind a 2px border, with four marked nodes
 * (a at 20,20; b at 120,20; c at 20,120; d at 120,120, each 50 square), a
 * button, and empty space between.
 */
const canvas = (style = '') => {
  const element = document.createElement('div')
  element.style.cssText = `position:absolute;left:100px;top:50px;width:300px;height:200px;border:2px solid;${style}`
  const node = (id: string, x: number, y: number) =>
    `<div data-node="${id}" style="position:absolute;left:${x}px;top:${y}px;width:50px;height:50px"></div>`
  element.innerHTML =
    node('a', 20, 20) +
    node('b', 120, 20) +
    node('c', 20, 120) +
    node('d', 120, 120) +
    `<button style="position:absolute;left:230px;top:80px;width:40px;height:30px">go</button>`
  document.body.append(element)
  return element
}

/** A client point from one in the canvas's border box's padding origin: the canvas sits at 100, 50 with a 2px border. */
const at = (x: number, y: number) => [102 + x, 52 + y] as const

const lasso = (from: readonly [number, number], to: readonly [number, number], extra = {}) => {
  pointer(from[0], from[1], 'pointerdown', extra)
  pointer((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 'pointermove', extra)
  pointer(to[0], to[1], 'pointermove', extra)
  pointer(to[0], to[1], 'pointerup', extra)
}

const ended = (facts: ReadonlyArray<MarqueeFact>) =>
  facts.find(fact => fact._tag === 'MarqueeEnded')

it('reports the rectangle in content coordinates and the marked nodes it touches, in document order', async () => {
  const element = canvas()
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    // From the empty space at (90, 90) to inside d and b's corner: touches b, d and c, but not a.
    lasso(at(90, 90), at(140, 30))
    await later(20)
    expect(run.facts.map(fact => fact._tag)).toEqual([
      'MarqueeStarted',
      'MarqueeChanged',
      'MarqueeChanged',
      'MarqueeEnded',
    ])
    expect(ended(run.facts)).toEqual({
      _tag: 'MarqueeEnded',
      rect: { x: 90, y: 30, width: 50, height: 60 },
      ids: ['b'],
      additive: false,
    })
  } finally {
    await run.stop()
  }
})

it('touches a node by any overlap, and not by edges that only meet', async () => {
  const element = canvas()
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    // a spans 20..70 by 20..70: the lasso from (5, 5) to (21, 21) overlaps it by a pixel, then ends at its corner.
    lasso(at(5, 5), at(21, 21))
    await later(20)
    expect(ended(run.facts)).toMatchObject({ ids: ['a'] })
    run.facts.length = 0
    // The same, meeting a's left edge at x = 20 while overlapping it in y.
    lasso(at(5, 30), at(20, 40))
    await later(20)
    expect(ended(run.facts)).toMatchObject({ ids: [] })
  } finally {
    await run.stop()
  }
})

it('draws up and to the left of the press as well', async () => {
  const element = canvas()
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    lasso(at(200, 190), at(60, 60))
    await later(20)
    expect(ended(run.facts)).toEqual({
      _tag: 'MarqueeEnded',
      rect: { x: 60, y: 60, width: 140, height: 130 },
      ids: ['a', 'b', 'c', 'd'],
      additive: false,
    })
  } finally {
    await run.stop()
  }
})

it('keeps the rectangle inside the container when the pointer leaves it', async () => {
  const element = canvas()
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    lasso(at(200, 190), [5, 5])
    await later(20)
    expect(ended(run.facts)).toMatchObject({ rect: { x: 0, y: 0, width: 200, height: 190 } })
  } finally {
    await run.stop()
  }
})

it('is not started by a press on a node, a control or the scrollbar, nor by a finger, nor by a press that stays', async () => {
  const element = canvas('overflow:auto')
  element.firstElementChild!.insertAdjacentHTML(
    'afterend',
    '<div style="position:absolute;left:0;top:400px;width:10px;height:10px"></div>',
  )
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    lasso(at(30, 30), at(150, 100)) // on node a
    lasso([102 + 235, 52 + 90], at(150, 150)) // on the button
    lasso(at(150, 70), at(200, 180), { pointerType: 'touch' })
    pointer(...at(150, 70), 'pointerdown')
    pointer(...at(152, 72), 'pointermove')
    pointer(...at(152, 72), 'pointerup')
    await later(20)
    expect(run.facts).toEqual([])
  } finally {
    await run.stop()
  }
})

it("is not started by a press on the container's own scrollbar", async () => {
  const element = canvas('overflow:auto')
  element.insertAdjacentHTML(
    'beforeend',
    '<div style="position:absolute;left:0;top:500px;width:10px;height:10px"></div>',
  )
  // Headless Chromium hides scrollbars, so clientWidth is what a 15px classic one would leave.
  Object.defineProperty(element, 'clientWidth', { value: 285 })
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    const inside = 102 + 285 - 5
    const onBar = 102 + 285 + 5
    lasso([onBar, 100], [inside - 60, 150])
    await later(20)
    expect(run.facts).toEqual([])
    lasso([inside, 100], [inside - 60, 150])
    await later(20)
    expect(ended(run.facts)).toBeDefined()
  } finally {
    await run.stop()
  }
})

it('ends with Escape, and a press elsewhere starts afresh', async () => {
  const element = canvas()
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    pointer(...at(90, 90), 'pointerdown')
    pointer(...at(140, 40), 'pointermove')
    const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.body.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(true)
    // The release that follows ends nothing: the lasso was cancelled.
    pointer(...at(140, 40), 'pointerup')
    await later(20)
    expect(run.facts.map(fact => fact._tag)).toEqual([
      'MarqueeStarted',
      'MarqueeChanged',
      'MarqueeCancelled',
    ])
    lasso(at(90, 90), at(140, 40))
    await later(20)
    expect(ended(run.facts)).toMatchObject({ ids: ['b'] })
  } finally {
    await run.stop()
  }
})

it('says a Shift, Ctrl or Meta press adds to what was selected', async () => {
  const element = canvas()
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    for (const key of ['shiftKey', 'ctrlKey', 'metaKey']) {
      run.facts.length = 0
      lasso(at(90, 90), at(140, 40), { [key]: true })
      await later(10)
      expect(run.facts.map(fact => ('additive' in fact ? fact.additive : null))).toEqual([
        true,
        true,
        true,
        true,
      ])
    }
  } finally {
    await run.stop()
  }
})

it('swallows the click a lasso ends with, and no other', async () => {
  const element = canvas()
  const run = drive(element, { attribute: 'data-node' })
  const clicks = vi.fn()
  document.body.addEventListener('click', clicks)
  try {
    await later(20)
    lasso(at(90, 90), at(140, 40))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(clicks).not.toHaveBeenCalled()
    // The next click is an ordinary one.
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(clicks).toHaveBeenCalledTimes(1)
  } finally {
    document.body.removeEventListener('click', clicks)
    await run.stop()
  }
})

it('lets a click through once the release that sent none has passed', async () => {
  const element = canvas()
  const run = drive(element, { attribute: 'data-node' })
  const clicks = vi.fn()
  document.body.addEventListener('click', clicks)
  try {
    await later(20)
    lasso(at(90, 90), at(140, 40))
    await later(10)
    // Enter on the button, a click with no pointer behind it.
    element.querySelector('button')!.click()
    expect(clicks).toHaveBeenCalledTimes(1)
  } finally {
    document.body.removeEventListener('click', clicks)
    await run.stop()
  }
})

it('listens to the document only while a press is under way, and lets go when ended mid-press', async () => {
  const element = canvas()
  const added = vi.spyOn(document, 'addEventListener')
  const removed = vi.spyOn(document, 'removeEventListener')
  const run = drive(element, { attribute: 'data-node' })
  await later(20)
  expect(added).not.toHaveBeenCalled()
  pointer(...at(90, 90), 'pointerdown')
  const during = added.mock.calls.map(call => call[0])
  expect(during).toEqual(
    expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel', 'keydown']),
  )
  pointer(...at(140, 40), 'pointermove')
  await run.stop()
  expect(removed.mock.calls.map(call => call[0]).sort()).toEqual([...during].sort())
})

it('stays under the first pointer', async () => {
  const element = canvas()
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    pointer(...at(90, 90), 'pointerdown')
    pointer(...at(10, 10), 'pointerdown', { pointerId: 2 })
    pointer(...at(140, 40), 'pointermove', { pointerId: 2 })
    await later(20)
    expect(run.facts).toEqual([])
    pointer(...at(140, 40), 'pointermove')
    pointer(...at(140, 40), 'pointerup', { pointerId: 2 })
    await later(20)
    expect(ended(run.facts)).toBeUndefined()
    pointer(...at(140, 40), 'pointerup')
    await later(20)
    expect(ended(run.facts)).toMatchObject({ ids: ['b'] })
  } finally {
    await run.stop()
  }
})

it('measures in a scrolled container by content, and follows an edge scroll under a still pointer', async () => {
  const element = document.createElement('div')
  element.style.cssText =
    'position:absolute;left:0;top:0;width:200px;height:100px;overflow:auto;border:0'
  for (let row = 0; row < 20; row++)
    element.insertAdjacentHTML(
      'beforeend',
      `<div data-node="r${row}" style="width:100px;height:30px;box-sizing:border-box">row ${row}</div>`,
    )
  document.body.append(element)
  const run = drive(element, { attribute: 'data-node', edgeScroll: {} })
  try {
    await later(20)
    element.scrollTop = 60
    // The press is at the top of what shows, which is content 60+.
    pointer(150, 5, 'pointerdown')
    pointer(50, 50, 'pointermove')
    await later(20)
    expect(run.facts.at(-1)).toMatchObject({
      rect: { x: 50, y: 65, width: 100, height: 45 },
      ids: ['r2', 'r3'],
    })
    pointer(50, 98, 'pointermove')
    await until(() => element.scrollTop > 200)
    pointer(50, 98, 'pointerup')
    await later(20)
    const last = ended(run.facts)
    expect(last).toMatchObject({ rect: { y: 65 } })
    // The pointer never left y = 98, yet the rectangle grew by what scrolled.
    expect(last!.rect.height).toBeGreaterThan(200)
    expect(last!.ids.length).toBeGreaterThan(6)
    expect(last!.ids.slice(0, 2)).toEqual(['r2', 'r3'])
  } finally {
    await run.stop()
  }
})

it('scrolls nothing unless asked', async () => {
  const element = document.createElement('div')
  element.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:100px;overflow:auto'
  element.innerHTML = '<div style="height:600px"></div>'
  document.body.append(element)
  const run = drive(element, { attribute: 'data-node' })
  try {
    await later(20)
    pointer(150, 5, 'pointerdown')
    pointer(50, 50, 'pointermove')
    pointer(50, 98, 'pointermove')
    await later(300)
    expect(element.scrollTop).toBe(0)
    pointer(50, 98, 'pointerup')
  } finally {
    await run.stop()
  }
})

it('shares a container with PointerDrag: a press on a node drags, a press on empty space lassos', async () => {
  const element = canvas()
  const lassos = drive(element, { attribute: 'data-node' })
  const drags: Array<DragFact> = []
  const fiber = Effect.runFork(
    Stream.runForEach(
      PointerDrag({ attribute: 'data-node' }).f(element, liveViewStateChanges),
      fact => Effect.sync(() => void drags.push(fact)),
    ),
  )
  try {
    await later(20)
    lasso(at(30, 30), at(150, 70))
    await later(20)
    expect(drags.map(fact => fact._tag)).toEqual(['DragStarted', 'DragDropped'])
    expect(lassos.facts).toEqual([])
    drags.length = 0
    lasso(at(90, 90), at(140, 40))
    await later(20)
    expect(drags).toEqual([])
    expect(ended(lassos.facts)).toMatchObject({ ids: ['b'] })
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
    await lassos.stop()
  }
})
