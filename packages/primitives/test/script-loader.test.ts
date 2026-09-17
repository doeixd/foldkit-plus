// @vitest-environment jsdom
/**
 * Script loading: appends once per URL, resolves on load, fails on error.
 */
import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'
import { ScriptMessage, loadScript } from '../src/dom/index.js'

const scripts = () => Array.from(document.getElementsByTagName('script'))
const withSrc = (src: string) => scripts().filter(element => element.getAttribute('src') === src)

const fire = (src: string, type: string) => {
  const element = withSrc(src)[0]
  expect(element).not.toBe(undefined)
  element!.dispatchEvent(new window.Event(type))
}

describe('loadScript', () => {
  it('appends the tag and yields Loaded on load', async () => {
    const src = 'https://example.com/a.js'
    const message = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(loadScript(src).effect)
        for (let i = 0; i < 100 && withSrc(src).length === 0; i++) {
          yield* Effect.yieldNow
        }
        expect(withSrc(src)).toHaveLength(1)
        expect(withSrc(src)[0]!.async).toBe(true)
        fire(src, 'load')
        return yield* Fiber.join(fiber)
      }),
    )
    expect(message).toEqual(ScriptMessage.Loaded())
    document.head.querySelectorAll(`script[src="${src}"]`).forEach(element => element.remove())
  })

  it('is idempotent by URL: the second load reuses the tag', async () => {
    const src = 'https://example.com/b.js'
    const tag = document.createElement('script')
    tag.setAttribute('src', src)
    document.head.appendChild(tag)
    try {
      expect(await Effect.runPromise(loadScript(src).effect)).toEqual(ScriptMessage.Loaded())
      expect(withSrc(src)).toHaveLength(1)
    } finally {
      tag.remove()
    }
  })

  it('concurrent loads share one tag and its fate', async () => {
    const src = 'https://example.com/d.js'
    try {
      const both = await Effect.runPromise(
        Effect.gen(function* () {
          const first = yield* Effect.forkChild(loadScript(src).effect)
          const second = yield* Effect.forkChild(loadScript(src).effect)
          for (let i = 0; i < 100 && withSrc(src).length === 0; i++) {
            yield* Effect.yieldNow
          }
          expect(withSrc(src)).toHaveLength(1)
          fire(src, 'load')
          return [yield* Fiber.join(first), yield* Fiber.join(second)] as const
        }),
      )
      expect(both).toEqual([ScriptMessage.Loaded(), ScriptMessage.Loaded()])
    } finally {
      document.head.querySelectorAll(`script[src="${src}"]`).forEach(element => element.remove())
    }
  })

  it('concurrent loads share a failure', async () => {
    const src = 'https://example.com/e.js'
    try {
      const both = await Effect.runPromise(
        Effect.gen(function* () {
          const first = yield* Effect.forkChild(loadScript(src).effect)
          const second = yield* Effect.forkChild(loadScript(src).effect)
          for (let i = 0; i < 100 && withSrc(src).length === 0; i++) {
            yield* Effect.yieldNow
          }
          fire(src, 'error')
          return [yield* Fiber.join(first), yield* Fiber.join(second)] as const
        }),
      )
      expect(both).toEqual([
        ScriptMessage.LoadFailed({ message: `failed to load script: ${src}` }),
        ScriptMessage.LoadFailed({ message: `failed to load script: ${src}` }),
      ])
      // The dead tag was removed, so a retry fetches afresh.
      expect(withSrc(src)).toHaveLength(0)
      const retry = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(loadScript(src).effect)
          for (let i = 0; i < 100 && withSrc(src).length === 0; i++) {
            yield* Effect.yieldNow
          }
          expect(withSrc(src)).toHaveLength(1)
          fire(src, 'load')
          return yield* Fiber.join(fiber)
        }),
      )
      expect(retry).toEqual(ScriptMessage.Loaded())
    } finally {
      document.head.querySelectorAll(`script[src="${src}"]`).forEach(element => element.remove())
    }
  })

  it('yields LoadFailed on error', async () => {
    const src = 'https://example.com/c.js'
    const message = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(loadScript(src).effect)
        for (let i = 0; i < 100 && withSrc(src).length === 0; i++) {
          yield* Effect.yieldNow
        }
        fire(src, 'error')
        return yield* Fiber.join(fiber)
      }),
    )
    expect(message).toEqual(ScriptMessage.LoadFailed({ message: `failed to load script: ${src}` }))
    document.head.querySelectorAll(`script[src="${src}"]`).forEach(element => element.remove())
  })
})
