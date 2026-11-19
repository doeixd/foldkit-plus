/**
 * The scrollspy over a page in a real browser: the stream reads the scroll, ends
 * with its fiber, and the mark lands on one link at a time.
 */
import { Effect, Fiber, Option, Stream } from 'effect'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'

import { markSection, sections } from '../src/spy.js'

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

const IDS = ['one', 'two', 'three']

/** `lists` copies of the links: a blog post draws its contents beside the column and folded above it. */
const mount = (lists = 1) => {
  document.body.style.margin = '0'
  for (let copy = 0; copy < lists; copy++) {
    const aside = document.createElement('aside')
    aside.setAttribute('aria-label', 'On this page')
    for (const id of IDS) {
      const link = document.createElement('a')
      link.href = `#${id}`
      link.textContent = id
      aside.append(link)
    }
    document.body.append(aside)
  }
  // Room above the first heading, where no section has begun.
  const lead = document.createElement('div')
  lead.style.blockSize = '600px'
  document.body.append(lead)
  for (const id of IDS) {
    const heading = document.createElement('h2')
    heading.id = id
    heading.textContent = id
    heading.style.cssText = 'margin:0;block-size:1200px'
    document.body.append(heading)
  }
}

const marked = () =>
  Array.from(document.querySelectorAll('a[aria-current]'), link => link.textContent)

test('the mark follows the sections, one link at a time, and clears', () => {
  mount()
  markSection(Option.some('two'))
  expect(marked()).toEqual(['two'])
  expect(document.querySelector('a[aria-current]')?.getAttribute('aria-current')).toBe('location')
  markSection(Option.some('three'))
  expect(marked()).toEqual(['three'])
  markSection(Option.none())
  expect(marked()).toEqual([])
})

test('the stream reads none, then each section as the page scrolls, and stops with its fiber', async () => {
  await page.viewport(800, 600)
  mount()
  const seen: Array<Option.Option<string>> = []
  const fiber = Effect.runFork(
    Stream.runForEach(sections, section => Effect.sync(() => seen.push(section))),
  )
  await vi.waitFor(() => expect(seen).toEqual([Option.none()]))
  window.scrollTo(0, 1750)
  await vi.waitFor(() => expect(seen.at(-1)).toEqual(Option.some('two')))
  window.scrollTo(0, 0)
  await vi.waitFor(() => expect(seen.at(-1)).toEqual(Option.none()))
  window.scrollTo(0, document.documentElement.scrollHeight)
  await vi.waitFor(() => expect(seen.at(-1)).toEqual(Option.some('three')))
  const count = seen.length
  await Effect.runPromise(Fiber.interrupt(fiber))
  window.scrollTo(0, 1750)
  await new Promise(done => setTimeout(done, 200))
  window.scrollTo(0, 0)
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
  expect(seen.length).toBe(count)
})

test('a contents drawn twice names each section once, and marks both copies', async () => {
  await page.viewport(800, 600)
  mount(2)
  const seen: Array<Option.Option<string>> = []
  const fiber = Effect.runFork(
    Stream.runForEach(sections, section => Effect.sync(() => seen.push(section))),
  )
  await vi.waitFor(() => expect(seen).toEqual([Option.none()]))
  window.scrollTo(0, 1750)
  await vi.waitFor(() => expect(seen.at(-1)).toEqual(Option.some('two')))
  markSection(Option.some('two'))
  expect(marked()).toEqual(['two', 'two'])
  await Effect.runPromise(Fiber.interrupt(fiber))
})
