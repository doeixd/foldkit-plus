/**
 * `pointedLinks` under a real pointer and keyboard: the events a mouse and the
 * Tab key send are the ones it reads, a pointer resting on a link's text reads
 * it once, its own box is the same link, and keys that pass a link on the way
 * to another read only the one they stop on. A finger is in
 * `pointed-links.touch.browser.test.ts`; the timing alone is in
 * `pointed-links.test.ts`.
 */
import { Effect, Fiber, Stream } from 'effect'
import { toString as urlToString } from 'foldkit/url'
import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { pointedLinks } from '../src/dom/index.js'

const at = (path: string) => `${window.location.origin}${path}`

/** A column of padded links, each with its text in a span, and an empty place below them. */
const page = (...paths: ReadonlyArray<string>) => {
  const links = paths.map(path => {
    const anchor = document.createElement('a')
    anchor.href = path
    anchor.style.cssText = 'display: block; width: 200px; padding: 20px'
    const text = document.createElement('span')
    text.textContent = path
    anchor.append(text)
    return anchor
  })
  const empty = document.createElement('div')
  empty.style.cssText = 'width: 200px; height: 200px'
  document.body.append(...links, empty)
  return { links, empty }
}

/** Every address the stream reads while it runs, as text. */
const reading = () => {
  const read: Array<string> = []
  const fiber = Effect.runFork(
    Stream.runForEach(pointedLinks(), url => Effect.sync(() => read.push(urlToString(url)))),
  )
  return { read, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) }
}

const rested = () => new Promise(resolve => setTimeout(resolve, 200))

afterEach(() => document.body.replaceChildren())

it('reads the link a mouse rests on once, its text and its box alike', async () => {
  const { links, empty } = page('/first', '/second')
  // The pointer is shared by every test file: put it somewhere known first.
  await userEvent.hover(empty)
  const { read, stop } = reading()
  try {
    await userEvent.hover(links[0]!.querySelector('span')!)
    await expect.poll(() => read).toEqual([at('/first')])
    // The link's own padding, outside its text: still the same link.
    await userEvent.hover(links[0]!, { position: { x: 5, y: 5 } })
    await rested()
    expect(read).toEqual([at('/first')])
    await userEvent.hover(empty)
    await userEvent.hover(links[1]!)
    await expect.poll(() => read).toEqual([at('/first'), at('/second')])
  } finally {
    await stop()
  }
})

it('reads the link Tab stops on, not the ones it passes', async () => {
  const { links } = page('/one', '/two', '/three')
  const start = document.createElement('button')
  document.body.prepend(start)
  start.focus()
  const { read, stop } = reading()
  try {
    await userEvent.keyboard('{Tab}{Tab}{Tab}')
    expect(document.activeElement).toBe(links[2])
    await expect.poll(() => read).toEqual([at('/three')])
    await rested()
    expect(read).toEqual([at('/three')])
  } finally {
    await stop()
  }
})
