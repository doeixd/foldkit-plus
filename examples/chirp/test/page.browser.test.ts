/// <reference types="@vitest/browser-playwright" />
/**
 * The page in a real browser, over the sandbox's own server. The compose
 * box's Chirp button holds its word in the middle, a profile's portrait is cut
 * out of the banner in the avatar's own shape, Delete shows on the reader's
 * own chirps alone, and a chirp posted is drawn once, where it stays.
 */
import { Deferred, Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { fromString } from 'foldkit/url'
import { Style } from 'foldkit-mixins'
import { RemoteClient } from 'foldkit-remote'
import { afterEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { init, Model, opening, durable, subscriptions, update, type Message } from '../src/app.js'
import { sandboxRemote } from '../src/server/connection.js'
import type { Person } from '../src/server/seed.js'
import { profileHref } from '../src/site.js'
import { stylesheet } from '../src/style.js'
import { view } from '../src/view.js'

/** Answers come from SQLite in WebAssembly, which a loaded runner takes a while to start. */
const answered = { timeout: 20_000 }

let dispose = () => {}
afterEach(() => {
  dispose()
  heard.length = 0
  document.body.replaceChildren()
})

/** The tag of every Message the page's `update` received, in order. */
const heard: Array<Message['_tag']> = []

/**
 * The page as `person` at `path`, on a sandbox started again from the seed.
 * Each write is sent once `answering` has run.
 */
const mount = async (
  path: string,
  person: Person = 'you',
  answering: Effect.Effect<void> = Effect.void,
) => {
  Style.install(stylesheet)
  const container = document.createElement('div')
  container.id = 'chirp-test'
  document.body.append(container)
  const restored = await Effect.runPromise(
    durable.restore(opening(person)).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => init(restored, Option.getOrThrow(fromString(`http://chirp.test${path}`))),
      update: (model: Model, message: Message) => {
        heard.push(message._tag)
        return update(model, message)
      },
      view: (model: Model, h: HtmlBuilder<Message>): Html => view(model, h).body,
      subscriptions,
      resources: Layer.merge(
        Layer.effect(
          RemoteClient,
          Effect.map(Effect.service(RemoteClient), client => ({
            ...client,
            mutate: request => Effect.andThen(answering, client.mutate(request)),
          })),
        ).pipe(Layer.provide(sandboxRemote(person, { fresh: true, offline: false, latency: 0 }))),
        KeyValueStore.layerMemory,
      ),
    }),
  )
  dispose = () => handle.dispose()
}

/**
 * Where the light ink of `element`'s label sits, from a screenshot: its
 * middle across, and the middle of its first letter (a capital, from its top
 * to the baseline) up and down, each in CSS pixels from the element's middle.
 */
const inkOffset = async (element: HTMLElement) => {
  const { width } = element.getBoundingClientRect()
  // Drawn four times as large, so a pixel of the screenshot is a quarter of one on the page.
  element.style.zoom = '4'
  const shot = await page.screenshot({ element, base64: true, save: false })
  const image = new Image()
  image.src = `data:image/png;base64,${shot}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0)
  const { data } = context.getImageData(0, 0, image.width, image.height)
  element.style.zoom = ''
  // Clear of the pill's round ends and its edges, where the page shows through.
  const end = Math.ceil(image.height / 2)
  const edge = Math.ceil(image.height / 8)
  const inked = (x: number, y: number) => {
    const at = (y * image.width + x) * 4
    return (data[at]! + data[at + 1]! + data[at + 2]!) / 3 > 200
  }
  const columns = Array.from({ length: image.width }, (_, x) =>
    x < end || x >= image.width - end
      ? []
      : Array.from({ length: image.height - 2 * edge }, (_, y) => y + edge).filter(y =>
          inked(x, y),
        ),
  )
  const left = columns.findIndex(column => column.length > 0)
  const right = columns.length - [...columns].reverse().findIndex(column => column.length > 0)
  // The first letter: the inked columns up to the first gap.
  const gap = columns.findIndex((column, x) => x > left && column.length === 0)
  const letter = columns.slice(left, gap).flat()
  const scale = image.width / width
  return {
    x: ((left + right) / 2 - image.width / 2) / scale,
    y: ((Math.min(...letter) + Math.max(...letter) + 1) / 2 - image.height / 2) / scale,
  }
}

it("holds the Chirp button's word in its middle, both ways", async () => {
  await mount('/')
  const submit = await vi.waitUntil(
    () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Chirp'),
    answered,
  )
  await document.fonts.ready
  const { x, y } = await inkOffset(submit)
  // Untrimmed, the line box's ascent above the capitals put them 1px low in Segoe UI.
  expect(Math.abs(x)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(y)).toBeLessThanOrEqual(0.5)
})

it("cuts a profile's portrait out of the banner in the avatar's shape", async () => {
  await mount(profileHref('you'))
  const portrait = await vi.waitUntil(
    () => document.querySelector<HTMLElement>('h2')?.previousElementSibling ?? undefined,
    answered,
  )
  const avatar = portrait.firstElementChild!
  const corner = getComputedStyle(avatar).borderRadius
  // Whatever paints the band of the page around the avatar: a border or a shadow.
  const painting = [portrait, ...portrait.querySelectorAll('*')].filter(element => {
    const style = getComputedStyle(element)
    return Number.parseFloat(style.borderTopWidth) > 0 || style.boxShadow !== 'none'
  })
  expect(painting.length).toBeGreaterThan(0)
  for (const element of painting) expect(getComputedStyle(element).borderRadius).toBe(corner)
})

/** The posts on the page, by what each says, and the buttons under each. */
const posts = () =>
  [...document.querySelectorAll('article')].map(article => ({
    body: article.querySelector('p')?.textContent ?? '',
    buttons: [...article.querySelectorAll('button')].map(button => button.textContent),
  }))
const deletable = () =>
  posts()
    .filter(post => post.buttons.some(text => text?.endsWith('Delete')))
    .map(post => post.body)

it.each([
  { person: 'you' as const, own: ['Hello, Chirp! My first post.'] },
  // The admin edits every chirp, and takes down only her own.
  {
    person: 'ada' as const,
    own: [
      'The engine weaves algebraic patterns as the loom weaves flowers.',
      'Rename a user once and every post shows it: the author is a reference, not a copy.',
    ],
  },
])('shows Delete on $person’s own chirps alone', async ({ person, own }) => {
  await mount('/', person)
  await vi.waitUntil(() => posts().length === 6, answered)
  expect(deletable().sort()).toEqual([...own].sort())
})

it('takes a chirp of yours away at once when Delete is pressed', async () => {
  await mount('/')
  await vi.waitUntil(() => deletable().length === 1, answered)
  const mine = [...document.querySelectorAll('article')].find(article =>
    article.textContent?.includes('My first post'),
  )!
  ;[...mine.querySelectorAll('button')]
    .find(button => button.textContent?.endsWith('Delete'))!
    .click()
  await vi.waitUntil(() => posts().length === 5)
  expect(posts().map(post => post.body)).not.toContain('Hello, Chirp! My first post.')
})

/** Resolves after the next `count` frames have been drawn. */
const frames = (count: number) =>
  new Promise<void>(resolve => {
    const next = (left: number) =>
      left === 0 ? resolve() : requestAnimationFrame(() => next(left - 1))
    next(count)
  })

it('draws a chirp posted once, where it stays, through the answer', async () => {
  // The answer held until the chirp has been drawn a few frames, as a slow server's is.
  const answer = Deferred.makeUnsafe<void>()
  await mount('/', 'you', Deferred.await(answer))
  await vi.waitUntil(() => posts().length === 6, answered)
  const main = document.querySelector('main')!
  await userEvent.fill(document.querySelector('textarea')!, 'Steady as she goes.')
  // What changed among the page's own parts: the feed's posts and the lines around them.
  const changes: Array<string> = []
  const observer = new MutationObserver(records =>
    records.forEach(record => {
      record.removedNodes.forEach(node => changes.push(`removed ${node.nodeName}`))
      record.addedNodes.forEach(node => changes.push(`added ${node.nodeName}`))
    }),
  )
  observer.observe(main, { childList: true })
  // Where the new post stood in each frame it was drawn.
  const tops: Array<number> = []
  let watching = true
  const measure = () => {
    const first = main.querySelector('article')
    if (first?.textContent?.includes('Steady as she goes.'))
      tops.push(first.getBoundingClientRect().top)
    if (watching) requestAnimationFrame(measure)
  }
  requestAnimationFrame(measure)
  const settled = heard.filter(tag => tag === 'MutationSucceeded').length
  ;[...document.querySelectorAll('button')].find(button => button.textContent === 'Chirp')!.click()
  await vi.waitUntil(() => tops.length > 0)
  await frames(3)
  Deferred.doneUnsafe(answer, Effect.void)
  await vi.waitUntil(
    () => heard.filter(tag => tag === 'MutationSucceeded').length > settled,
    answered,
  )
  await frames(5)
  watching = false
  observer.disconnect()
  expect(changes).toEqual(['added ARTICLE'])
  expect(tops.length).toBeGreaterThan(0)
  expect(new Set(tops).size).toBe(1)
})
