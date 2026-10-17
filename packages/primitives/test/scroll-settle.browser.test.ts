/**
 * `ScrollSettle` on a real snapping scroller: at insert it scrolls to `start`
 * and reports it, and after a scroll comes to rest it reports the item that
 * starts nearest the scroller's start, right to left from the right edge.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it } from 'vitest'
import { ScrollSettle } from '../src/dom/scroll-settle.js'

afterEach(() => {
  document.body.innerHTML = ''
})

/** A 200px scroller of five 200px items, each a snap stop no scroll passes, `dir` as given. */
const scroller = (dir: 'ltr' | 'rtl' = 'ltr') => {
  const element = document.createElement('div')
  element.dir = dir
  element.style.cssText =
    'display: flex; width: 200px; overflow-x: auto; scroll-snap-type: x mandatory'
  for (const index of [0, 1, 2, 3, 4]) {
    const child = document.createElement('div')
    child.style.cssText =
      'flex: 0 0 200px; height: 40px; scroll-snap-align: start; scroll-snap-stop: always'
    child.textContent = String(index)
    element.appendChild(child)
  }
  document.body.appendChild(element)
  return element
}

const listen = (element: HTMLElement, start?: number) => {
  const heard: Array<number> = []
  const fiber = Effect.runFork(
    Stream.runForEach(
      ScrollSettle(start === undefined ? {} : { start }).f(element, liveViewStateChanges),
      settled => Effect.sync(() => heard.push(settled.index)),
    ),
  )
  return { heard, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) }
}

it('reports where it rests at insert, then the item nearest the start after a scroll', async () => {
  const element = scroller()
  const { heard, stop } = listen(element)
  try {
    await expect.poll(() => heard).toEqual([0])
    // Short of the third item's start: the snap carries it there, and that is what is heard.
    element.scrollTo({ left: 380, behavior: 'instant' })
    await expect.poll(() => heard.at(-1)).toBe(2)
    expect(element.scrollLeft).toBe(400)
  } finally {
    await stop()
  }
})

it('starts at `start`, at once', async () => {
  const element = scroller()
  const { heard, stop } = listen(element, 3)
  try {
    await expect.poll(() => heard).toEqual([3])
    expect(element.scrollLeft).toBe(600)
  } finally {
    await stop()
  }
})

it('reads the start from the right, right to left', async () => {
  const element = scroller('rtl')
  const { heard, stop } = listen(element, 1)
  try {
    await expect.poll(() => heard).toEqual([1])
    // Chrome's right-to-left scrollLeft runs from 0 to negative.
    expect(element.scrollLeft).toBe(-200)
    element.scrollTo({ left: -800, behavior: 'instant' })
    await expect.poll(() => heard.at(-1)).toBe(4)
  } finally {
    await stop()
  }
})
