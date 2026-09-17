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
