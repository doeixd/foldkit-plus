/// <reference types="@vitest/browser-playwright" />
/**
 * `visibleLinks` in a real browser, where layout and the IntersectionObserver
 * decide what is on screen: a page of 50 links starts at most `atMost` reads,
 * an address is read once, a link outside the viewport or marked
 * `data-preload="none"` is not read, and Save-Data or a hidden tab read none.
 */
import { Effect, Fiber, Stream } from 'effect'
import { toString as urlToString } from 'foldkit/url'
import { afterEach, expect, it, vi } from 'vitest'
import { visibleLinks } from '../src/dom/index.js'

const at = (path: string) => `${window.location.origin}${path}`

/** `count` links, each 30px tall, drawn from the top of the page. */
const column = (count: number, from = 0): ReadonlyArray<HTMLAnchorElement> => {
  const links = Array.from({ length: count }, (_, index) => {
    const anchor = document.createElement('a')
    anchor.href = `/page-${from + index}`
    anchor.textContent = `page ${from + index}`
    anchor.style.cssText = 'display: block; height: 30px; width: 100px'
    return anchor
  })
  document.body.append(...links)
  return links
}

/** Every address the stream reads while it runs, as text. */
const reading = (options?: Parameters<typeof visibleLinks>[0]) => {
  const read: Array<string> = []
  const fiber = Effect.runFork(
    Stream.runForEach(visibleLinks(options), url => Effect.sync(() => read.push(urlToString(url)))),
  )
  return { read, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) }
}

const settled = () => new Promise(resolve => setTimeout(resolve, 300))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'visibilityState')
  document.body.replaceChildren()
  window.scrollTo(0, 0)
})

it('starts at most atMost reads for a page of 50 links, the first in view', async () => {
  // 50 links of 30px, the viewport holds at least ten of them.
  column(50)
  const { read, stop } = reading({ atMost: 3 })
  try {
    await expect.poll(() => read.length).toBe(3)
    await settled()
    expect(read).toEqual([at('/page-0'), at('/page-1'), at('/page-2')])
  } finally {
    await stop()
  }
})

it('reads what is on screen once, and what scrolls into view after it', async () => {
  column(60)
  const { read, stop } = reading({ atMost: 100 })
  try {
    await expect.poll(() => read.length).toBeGreaterThan(0)
    await settled()
    const first = read.length
    expect(read).not.toContain(at('/page-59'))
    // Scrolling away and back reads nothing twice.
    window.scrollTo(0, 60 * 30)
    await expect.poll(() => read).toContain(at('/page-59'))
    window.scrollTo(0, 0)
    await settled()
    expect(new Set(read).size).toBe(read.length)
    expect(read.length).toBeGreaterThan(first)
  } finally {
    await stop()
  }
})

// An IntersectionObserver in the test's iframe is clipped by the iframe's own
// box, so a margin cannot widen what it sees there: the option is checked as
// passed on, and the real observer is left to do the rest.
it('gives the margin to the observer it makes, and 0px when none is given', async () => {
  const given: Array<string | undefined> = []
  const Real = window.IntersectionObserver
  vi.stubGlobal(
    'IntersectionObserver',
    class extends Real {
      constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
        given.push(init?.rootMargin)
        super(callback, init)
      }
    },
  )
  const plain = reading()
  const wide = reading({ margin: '300px' })
  try {
    await expect.poll(() => given).toEqual(['0px', '300px'])
  } finally {
    await plain.stop()
    await wide.stop()
  }
})

it('reads an address once though several links on the page go there', async () => {
  const [first, second] = column(2)
  second!.href = first!.href
  const { read, stop } = reading()
  try {
    await expect.poll(() => read).toEqual([at('/page-0')])
    await settled()
    expect(read).toEqual([at('/page-0')])
  } finally {
    await stop()
  }
})

it('reads a link added to the page after it starts', async () => {
  const { read, stop } = reading()
  try {
    await settled()
    column(1, 7)
    await expect.poll(() => read).toEqual([at('/page-7')])
  } finally {
    await stop()
  }
})

it('skips data-preload="none", another origin, and a link out of view', async () => {
  const [off, away] = column(3)
  off!.dataset['preload'] = 'none'
  away!.href = 'https://elsewhere.test/x'
  const far = document.createElement('div')
  far.style.height = '5000px'
  const below = document.createElement('a')
  below.href = '/below'
  below.textContent = 'below'
  document.body.append(far, below)
  const { read, stop } = reading()
  try {
    await expect.poll(() => read).toEqual([at('/page-2')])
    await settled()
    expect(read).toEqual([at('/page-2')])
  } finally {
    await stop()
  }
})

it('reads nothing under Save-Data or a 2g connection', async () => {
  for (const connection of [{ saveData: true }, { effectiveType: '2g' }]) {
    vi.stubGlobal('navigator', Object.create(navigator, { connection: { value: connection } }))
    column(5)
    const { read, stop } = reading()
    try {
      await settled()
      expect(read).toEqual([])
    } finally {
      await stop()
      document.body.replaceChildren()
      vi.unstubAllGlobals()
    }
  }
})

it('reads nothing while the tab is hidden', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  column(5)
  const { read, stop } = reading()
  try {
    await settled()
    expect(read).toEqual([])
  } finally {
    await stop()
  }
})

it('counts the cap again for each page', async () => {
  column(10)
  const { read, stop } = reading({ atMost: 2 })
  try {
    await expect.poll(() => read.length).toBe(2)
    history.pushState({}, '', '/elsewhere')
    document.body.replaceChildren()
    column(10, 20)
    await expect.poll(() => read.length).toBe(4)
    await settled()
    expect(read.length).toBe(4)
  } finally {
    history.replaceState({}, '', '/')
    await stop()
  }
})

it('stops observing when the stream ends', async () => {
  const { read, stop } = reading()
  await settled()
  await stop()
  column(3)
  await settled()
  expect(read).toEqual([])
})
