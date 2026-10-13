// @vitest-environment jsdom
/**
 * `pointedLinks`: the address of the link a reader points at or tabs to, on
 * this origin only, once while they stay on it.
 */
import { Effect, Fiber } from 'effect'
import { toString as urlToString } from 'foldkit/url'
import { afterEach, expect, it, vi } from 'vitest'
import { pointedLinks } from '../src/dom/index.js'
import { takeMessages } from './support.js'

/** A link, and the text inside it the pointer crosses first. */
const link = (href: string): readonly [HTMLAnchorElement, HTMLSpanElement] => {
  const anchor = document.createElement('a')
  anchor.href = href
  const text = document.createElement('span')
  anchor.append(text)
  document.body.append(anchor)
  return [anchor, text]
}

/**
 * Watches `document` for both listeners, and waits until they are there: an
 * event sent before then reaches no one, and a fixed number of yields was too
 * few on a busy machine. Call it before the stream starts.
 */
const listening = (): Effect.Effect<void> => {
  const attached = new Set<string>()
  const add = document.addEventListener.bind(document)
  const both = new Promise<void>(resolve =>
    vi
      .spyOn(document, 'addEventListener')
      .mockImplementation((...args: Parameters<Document['addEventListener']>) => {
        add(...args)
        attached.add(args[0])
        if (attached.has('pointerover') && attached.has('focusin')) resolve()
      }),
  )
  return Effect.promise(() => both)
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('reads each link pointed at or tabbed to, on this origin, once while the reader stays', async () => {
  const [blog, blogText] = link('/site/blog')
  const [away] = link('https://elsewhere.test/x')
  const [post] = link('/site/blog/a-post')
  const pointed = await Effect.runPromise(
    Effect.gen(function* () {
      const attached = listening()
      const fiber = yield* Effect.forkChild(takeMessages(pointedLinks(), 2))
      yield* attached
      const over = (element: Element) =>
        element.dispatchEvent(new window.Event('pointerover', { bubbles: true }))
      over(blogText)
      // The same link again, from its own box: still the same place.
      over(blog)
      over(away)
      post.focus()
      return yield* Fiber.join(fiber)
    }),
  )
  expect(pointed.map(urlToString)).toEqual([
    `${window.location.origin}/site/blog`,
    `${window.location.origin}/site/blog/a-post`,
  ])
})

it('reads the link around what the pointer crosses, and nothing outside one', async () => {
  const plain = document.createElement('p')
  document.body.append(plain)
  const [, blogText] = link('/site/blog')
  const pointed = await Effect.runPromise(
    Effect.gen(function* () {
      const attached = listening()
      const fiber = yield* Effect.forkChild(takeMessages(pointedLinks(), 1))
      yield* attached
      plain.dispatchEvent(new window.Event('pointerover', { bubbles: true }))
      blogText.dispatchEvent(new window.Event('pointerover', { bubbles: true }))
      return yield* Fiber.join(fiber)
    }),
  )
  expect(pointed.map(urlToString)).toEqual([`${window.location.origin}/site/blog`])
})
