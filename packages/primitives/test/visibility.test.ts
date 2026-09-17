// @vitest-environment jsdom
/**
 * Visibility: starts from the document, follows visibilitychange, and
 * places through a real assembly.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Visibility, VisibilityMessage } from '../src/events/index.js'
import { takeMessages } from './support.js'

const Tab = Bundle.declare(Visibility, 'tab')
const Model = Schema.Struct({ ...Tab.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Tab.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Tab)

const fold = (model: Model, message: Parameters<typeof Tab.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Tab.wrapper.make(message))).model.tab

describe('Visibility transitions', () => {
  it('starts from the document and follows Changed', () => {
    expect(placed.init({ tab: { visible: false } }).model.tab).toEqual({ visible: true })
    expect(fold({ tab: { visible: true } }, VisibilityMessage.Changed({ visible: false }))).toEqual(
      {
        visible: false,
      },
    )
  })
})

describe('Visibility stream', () => {
  const streamFor = () => {
    const entry = Visibility.subscriptions!().changes!
    return entry.dependenciesToStream(entry.modelToDependencies({ visible: true }), () => ({}))
  }

  it('emits the current value, then flips', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(streamFor(), 2))
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      VisibilityMessage.Changed({ visible: true }),
      VisibilityMessage.Changed({ visible: false }),
    ])
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
})

describe('Visibility in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(placed)
    const update = assembly.update(model => ({ model }))
    const hidden = update(
      { tab: { visible: true } },
      Tab.wrapper.make(VisibilityMessage.Changed({ visible: false })),
    )
    expect(hidden.model.tab).toEqual({ visible: false })
    expect(Object.keys(assembly.subscriptions())).toEqual(['Visibility@tab/changes'])
  })
})
