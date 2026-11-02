/**
 * `WindowViewport` in a real browser: a box above the list growing moves the
 * list with no scroll, and neither the list nor the page changes size.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { ViewportPlaced, WindowViewport } from '../src/state/index.js'

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.cssText = ''
  document.documentElement.style.minHeight = ''
})

it('reports the list moving when a preceding box grows, though nothing else resizes and there is no scroll', async () => {
  document.documentElement.style.minHeight = '100vh'
  document.body.style.cssText = 'margin: 0; min-height: 100vh'
  const header = document.createElement('div')
  header.style.height = '20px'
  const list = document.createElement('div')
  list.style.height = '50px'
  document.body.append(header, list)
  const seen: Array<ViewportPlaced> = []
  const rect = vi.spyOn(list, 'getBoundingClientRect')
  const fiber = Effect.runFork(
    Stream.runForEach(WindowViewport().f(list, liveViewStateChanges), message =>
      Effect.sync(() => {
        seen.push(message)
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(seen.at(-1)?.top).toBe(-20))
    // Each observer's first delivery reads the box again. Let that land first,
    // or it would report the move below and hide what is being tested.
    await vi.waitFor(() => expect(rect.mock.calls.length).toBeGreaterThan(1))
    const listHeight = list.getBoundingClientRect().height
    const pageHeight = document.documentElement.clientHeight
    expect(window.scrollY).toBe(0)

    header.style.height = '60px'
    await vi.waitFor(() => expect(seen.at(-1)?.top).toBe(-60))

    // The list moved, but it and the page kept their sizes: only the box above
    // changed size, which a list-plus-page observation would miss.
    expect(list.getBoundingClientRect().height).toBe(listHeight)
    expect(document.documentElement.clientHeight).toBe(pageHeight)
    expect(window.scrollY).toBe(0)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
    rect.mockRestore()
    header.remove()
    list.remove()
  }
})
