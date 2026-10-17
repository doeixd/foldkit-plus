/**
 * `TrackBox` on a real page: it writes the target's viewport box on the
 * element it is mounted on and follows it as it scrolls (in any scroller),
 * resizes, is drawn anew under the same id, leaves, or is swapped for
 * another by `data-target`, telling each change of target; and released, it
 * lets go of every observer and listener, with none attached when one of
 * them cannot be made.
 */
import { Effect, Exit, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { TRACK_TARGET_ATTRIBUTE, TrackBox, TrackedTarget } from '../src/dom/track-box.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  window.scrollTo(0, 0)
})

/** A 120 by 40 box at `left`, `top` inside `parent`, with the id given. */
const box = (id: string, left: number, top: number, parent: Element = document.body) => {
  const element = document.createElement('div')
  element.id = id
  element.style.cssText = `position: absolute; left: ${left}px; top: ${top}px; width: 120px; height: 40px`
  parent.append(element)
  return element
}

/** The window's scroll and resize listeners a spy saw, in order of type. */
const typesOf = (spy: {
  readonly mock: { readonly calls: ReadonlyArray<ReadonlyArray<unknown>> }
}) =>
  spy.mock.calls
    .map(([type]) => type)
    .filter(type => type === 'scroll' || type === 'resize')
    .sort()

const follow = (target: string, radius = false) => {
  const element = document.createElement('div')
  element.setAttribute(TRACK_TARGET_ATTRIBUTE, target)
  document.body.append(element)
  const heard: Array<TrackedTarget> = []
  const fiber = Effect.runFork(
    Stream.runForEach(TrackBox({ name: 't', radius }).f(element, liveViewStateChanges), told =>
      Effect.sync(() => heard.push(told)),
    ),
  )
  const read = (property: string) => element.style.getPropertyValue(`--fk-t-${property}`)
  const place = () => ({ x: read('x'), y: read('y'), w: read('w'), h: read('h') })
  return {
    element,
    heard,
    place,
    read,
    fiber,
    stop: () => Effect.runPromise(Fiber.interrupt(fiber)),
  }
}

it('writes the target box on its own element, and tells that it is found', async () => {
  box('target', 30, 50).style.borderRadius = '6px'
  const tracked = follow('target', true)
  try {
    await expect
      .poll(() => tracked.place())
      .toEqual({ x: '30px', y: '50px', w: '120px', h: '40px' })
    expect(tracked.read('radius')).toBe('6px')
    expect(tracked.heard).toEqual([TrackedTarget.make({ target: 'target', found: true })])
  } finally {
    await tracked.stop()
  }
})

it('writes no radius unless asked', async () => {
  box('target', 30, 50).style.borderRadius = '6px'
  const tracked = follow('target')
  try {
    await expect.poll(() => tracked.place().x).toBe('30px')
    expect(tracked.read('radius')).toBe('')
  } finally {
    await tracked.stop()
  }
})

it('follows the target as the window or a scroller around it scrolls', async () => {
  const scroller = document.createElement('div')
  scroller.style.cssText =
    'position: absolute; left: 0; top: 0; width: 300px; height: 200px; overflow: auto'
  document.body.append(scroller)
  box('target', 30, 150, scroller)
  box('tall', 0, 2000)
  box('wide', 0, 600, scroller)
  const tracked = follow('target')
  try {
    await expect.poll(() => tracked.place().y).toBe('150px')
    scroller.scrollTo({ top: 100, behavior: 'instant' })
    await expect.poll(() => tracked.place().y).toBe('50px')
    window.scrollTo({ top: 40, behavior: 'instant' })
    await expect.poll(() => tracked.place().y).toBe('10px')
  } finally {
    await tracked.stop()
  }
})

it('follows the target as it resizes', async () => {
  const target = box('target', 30, 50)
  const tracked = follow('target')
  try {
    await expect.poll(() => tracked.place().w).toBe('120px')
    target.style.width = '200px'
    await expect.poll(() => tracked.place().w).toBe('200px')
  } finally {
    await tracked.stop()
  }
})

it('finds a target drawn anew under the same id, and tells when it is gone', async () => {
  const first = box('target', 30, 50)
  const tracked = follow('target')
  try {
    await expect.poll(() => tracked.place().x).toBe('30px')
    first.remove()
    // The new one alone is followed: its resize is heard, the old one's is not.
    const again = box('target', 80, 90)
    await expect
      .poll(() => tracked.place())
      .toEqual({ x: '80px', y: '90px', w: '120px', h: '40px' })
    again.style.height = '70px'
    await expect.poll(() => tracked.place().h).toBe('70px')
    // Swapped in one change, it was never missing.
    expect(tracked.heard.map(told => told.found)).toEqual([true])
    again.remove()
    await expect.poll(() => tracked.heard.at(-1)?.found).toBe(false)
    expect(tracked.place()).toEqual({ x: '', y: '', w: '', h: '' })
  } finally {
    await tracked.stop()
  }
})

it('follows another target when `data-target` changes, and nothing when it is empty', async () => {
  box('one', 30, 50)
  box('two', 200, 300)
  const tracked = follow('one')
  try {
    await expect.poll(() => tracked.place().x).toBe('30px')
    tracked.element.setAttribute(TRACK_TARGET_ATTRIBUTE, 'two')
    await expect.poll(() => tracked.place().x).toBe('200px')
    tracked.element.setAttribute(TRACK_TARGET_ATTRIBUTE, 'nowhere')
    await expect.poll(() => tracked.place().x).toBe('')
    tracked.element.setAttribute(TRACK_TARGET_ATTRIBUTE, '')
    await expect.poll(() => tracked.read('x')).toBe('')
    // Told after the empty one, so an empty target told would stand before it.
    tracked.element.setAttribute(TRACK_TARGET_ATTRIBUTE, 'one')
    await expect.poll(() => tracked.heard.length).toBe(4)
    expect(tracked.heard).toEqual([
      TrackedTarget.make({ target: 'one', found: true }),
      TrackedTarget.make({ target: 'two', found: true }),
      TrackedTarget.make({ target: 'nowhere', found: false }),
      TrackedTarget.make({ target: 'one', found: true }),
    ])
  } finally {
    await tracked.stop()
  }
})

it('released, lets go of its observers and listeners', async () => {
  const resized = vi.spyOn(ResizeObserver.prototype, 'disconnect')
  const changed = vi.spyOn(MutationObserver.prototype, 'disconnect')
  const removed = vi.spyOn(window, 'removeEventListener')
  const target = box('target', 30, 50)
  const tracked = follow('target')
  await expect.poll(() => tracked.place().x).toBe('30px')
  await tracked.stop()
  expect(resized).toHaveBeenCalledTimes(1)
  expect(changed).toHaveBeenCalledTimes(1)
  expect(typesOf(removed)).toEqual(['resize', 'scroll'])
  // Nothing follows the target any more.
  target.style.left = '90px'
  target.style.width = '10px'
  window.dispatchEvent(new Event('resize'))
  await new Promise(resolve => requestAnimationFrame(resolve))
  expect(tracked.place()).toEqual({ x: '30px', y: '50px', w: '120px', h: '40px' })
})

it('attaches nothing when an observer cannot be made', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor() {
        throw new Error('no ResizeObserver')
      }
    },
  )
  const observed = vi.spyOn(MutationObserver.prototype, 'observe')
  const added = vi.spyOn(window, 'addEventListener')
  box('target', 30, 50)
  const tracked = follow('target')
  const exit = await Effect.runPromise(Fiber.await(tracked.fiber))
  expect(Exit.isFailure(exit)).toBe(true)
  expect(observed).not.toHaveBeenCalled()
  expect(typesOf(added)).toEqual([])
})
