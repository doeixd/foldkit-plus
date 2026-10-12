// @vitest-environment jsdom
/**
 * `pointedLinks`: the address of the link a reader points at or tabs to, on
 * this origin only, once while they stay on it.
 */
import { Effect, Fiber } from 'effect'
import { toString as urlToString } from 'foldkit/url'
import { afterEach, expect, it } from 'vitest'
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

const settle = Effect.gen(function* () {
  for (let i = 0; i < 100; i++) yield* Effect.yieldNow
})

afterEach(() => {
  document.body.replaceChildren()
})

it('reads each link pointed at or tabbed to, on this origin, once while the reader stays', async () => {
  const [blog, blogText] = link('/site/blog')
  const [away] = link('https://elsewhere.test/x')
  const [post] = link('/site/blog/a-post')
  const pointed = await Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(takeMessages(pointedLinks(), 2))
      yield* settle
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
      const fiber = yield* Effect.forkChild(takeMessages(pointedLinks(), 1))
      yield* settle
      plain.dispatchEvent(new window.Event('pointerover', { bubbles: true }))
      blogText.dispatchEvent(new window.Event('pointerover', { bubbles: true }))
      return yield* Fiber.join(fiber)
    }),
  )
  expect(pointed.map(urlToString)).toEqual([`${window.location.origin}/site/blog`])
})
