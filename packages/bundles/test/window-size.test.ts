// @vitest-environment jsdom
/**
 * WindowSize: starts at zero, follows resizes with one listener, and places
 * through a real assembly.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { WindowSize, WindowSizeMessage } from '../src/events/index.js'
import { takeMessages } from './support.js'

const Viewport = Bundle.declare(WindowSize, 'viewport')
const Model = Schema.Struct({ ...Viewport.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Viewport.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Viewport)

const fold = (model: Model, message: Parameters<typeof Viewport.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Viewport.wrapper.make(message))).model.viewport

describe('WindowSize transitions', () => {
  it('starts at zero and follows Changed', () => {
    expect(placed.init({ viewport: { width: 9, height: 9 } }).model.viewport).toEqual({
      width: 0,
      height: 0,
    })
    expect(
      fold(
        { viewport: { width: 0, height: 0 } },
        WindowSizeMessage.Changed({ width: 800, height: 600 }),
      ),
    ).toEqual({ width: 800, height: 600 })
  })
})

describe('WindowSize stream', () => {
  const streamFor = () => {
    const entry = WindowSize.subscriptions!().changes!
    return entry.dependenciesToStream(
      entry.modelToDependencies({ width: 0, height: 0 }),
      () => ({}),
    )
  }

  it('emits the current size, then resizes, with one listener', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
    let added = 0
    let removed = 0
    const origAdd = window.addEventListener
    const origRemove = window.removeEventListener
    window.addEventListener = ((...args: Array<unknown>) => {
      added++
      return (origAdd as (...a: Array<unknown>) => void)(...args)
    }) as typeof window.addEventListener
    window.removeEventListener = ((...args: Array<unknown>) => {
      removed++
      return (origRemove as (...a: Array<unknown>) => void)(...args)
    }) as typeof window.removeEventListener
    try {
      const values = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(takeMessages(streamFor(), 2))
          for (let i = 0; i < 100 && added === 0; i++) {
            yield* Effect.yieldNow
          }
          Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
          window.dispatchEvent(new window.Event('resize'))
          return yield* Fiber.join(fiber)
        }),
      )
      expect(values).toEqual([
        WindowSizeMessage.Changed({ width: 800, height: 600 }),
        WindowSizeMessage.Changed({ width: 1024, height: 600 }),
      ])
      expect(added).toBe(1)
      expect(removed).toBe(1)
    } finally {
      window.addEventListener = origAdd
      window.removeEventListener = origRemove
    }
  })
})

describe('WindowSize in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(placed)
    const update = assembly.update(model => ({ model }))
    const changed = update(
      { viewport: { width: 0, height: 0 } },
      Viewport.wrapper.make(WindowSizeMessage.Changed({ width: 1, height: 2 })),
    )
    expect(changed.model.viewport).toEqual({ width: 1, height: 2 })
    expect(Object.keys(assembly.subscriptions())).toEqual(['WindowSize@viewport/changes'])
  })
})
