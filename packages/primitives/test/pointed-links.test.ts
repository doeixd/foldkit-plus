// @vitest-environment jsdom
/**
 * `pointedLinks`: the address of the link a reader means to follow, on this
 * origin only. A pointer or focus counts once it rests, leaving first cancels
 * it, and a finger counts at once. A real pointer, keyboard and finger are in
 * `packages/site/test/intent*.browser.test.ts`.
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

const LISTENED = ['pointerover', 'pointerout', 'focusin', 'focusout']

/**
 * Watches `document` for every listener, and waits until they are there: an
 * event sent before then reaches no one, and a fixed number of yields was too
 * few on a busy machine. Call it before the stream starts.
 */
const listening = (): Effect.Effect<void> => {
  const attached = new Set<string>()
  const add = document.addEventListener.bind(document)
  const all = new Promise<void>(resolve =>
    vi
      .spyOn(document, 'addEventListener')
      .mockImplementation((...args: Parameters<Document['addEventListener']>) => {
        add(...args)
        attached.add(args[0])
        if (LISTENED.every(type => attached.has(type))) resolve()
      }),
  )
  return Effect.promise(() => all)
}

/** A pointer event jsdom can send: it has no `PointerEvent`, so the fields are set by hand. */
const pointer = (
  element: Element,
  type: 'pointerover' | 'pointerout',
  init: { readonly pointerType?: string; readonly relatedTarget?: EventTarget | null } = {},
) => {
  const event = new window.Event(type, { bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' })
  Object.defineProperty(event, 'relatedTarget', { value: init.relatedTarget ?? null })
  element.dispatchEvent(event)
}

/** The first `count` addresses `act` leads the stream to, as text. */
const pointedAfter = (count: number, act: Effect.Effect<void>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const attached = listening()
      const fiber = yield* Effect.forkChild(takeMessages(pointedLinks(), count, '1 second'))
      yield* attached
      yield* act
      return (yield* Fiber.join(fiber)).map(urlToString)
    }),
  )

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

const at = (path: string) => `${window.location.origin}${path}`
const rest = Effect.sleep('120 millis')

it('reads a link the pointer rests on, once however many elements inside it it crosses', async () => {
  const [blog, blogText] = link('/site/blog')
  const [post] = link('/site/blog/a-post')
  const pointed = await pointedAfter(
    2,
    Effect.gen(function* () {
      pointer(blogText, 'pointerover')
      // From its text to its own box: still the same link, and the wait goes on.
      pointer(blogText, 'pointerout', { relatedTarget: blog })
      pointer(blog, 'pointerover')
      yield* rest
      pointer(blog, 'pointerout', { relatedTarget: post })
      pointer(post, 'pointerover')
    }),
  )
  expect(pointed).toEqual([at('/site/blog'), at('/site/blog/a-post')])
})

it('reads only the link a sweeping pointer stops on', async () => {
  const links = ['/a', '/b', '/c'].map(path => link(path)[0])
  const pointed = await pointedAfter(
    1,
    Effect.sync(() => links.forEach(each => pointer(each, 'pointerover'))),
  )
  expect(pointed).toEqual([at('/c')])
})

it('cancels a link the pointer leaves before resting on it', async () => {
  const [left] = link('/left')
  const [kept] = link('/kept')
  const outside = document.createElement('p')
  document.body.append(outside)
  const pointed = await pointedAfter(
    1,
    Effect.gen(function* () {
      pointer(left, 'pointerover')
      pointer(left, 'pointerout', { relatedTarget: outside })
      yield* rest
      pointer(kept, 'pointerover')
    }),
  )
  expect(pointed).toEqual([at('/kept')])
})

it('reads a link tabbed to once focus rests, and not one tabbed past', async () => {
  const [past] = link('/past')
  const [stopped] = link('/stopped')
  const pointed = await pointedAfter(
    1,
    Effect.sync(() => {
      past.focus()
      stopped.focus()
    }),
  )
  expect(pointed).toEqual([at('/stopped')])
})

it('reads a link a finger lands on at once, before any wait', async () => {
  const [tapped] = link('/tapped')
  const [hovered] = link('/hovered')
  const pointed = await pointedAfter(
    2,
    Effect.sync(() => {
      pointer(tapped, 'pointerover', { pointerType: 'touch' })
      // A wait for the finger's link would be cancelled by this one.
      pointer(hovered, 'pointerover')
    }),
  )
  expect(pointed).toEqual([at('/tapped'), at('/hovered')])
})

it('reads nothing outside a link, or on another origin', async () => {
  const plain = document.createElement('p')
  document.body.append(plain)
  const [away] = link('https://elsewhere.test/x')
  const [, blogText] = link('/site/blog')
  const pointed = await pointedAfter(
    1,
    Effect.gen(function* () {
      pointer(plain, 'pointerover')
      yield* rest
      pointer(away, 'pointerover')
      yield* rest
      pointer(blogText, 'pointerover')
    }),
  )
  expect(pointed).toEqual([at('/site/blog')])
})
