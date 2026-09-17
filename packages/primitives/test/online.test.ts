// @vitest-environment jsdom
/**
 * Online: pure transitions, the navigator default, the online/offline stream
 * against dispatched window events, and placement through a real assembly.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { afterEach, describe, expect, it } from 'vitest'
import { Online, OnlineMessage, type OnlineModel } from '../src/net/index.js'
import { takeMessages } from './support.js'

const OnlineDeclared = Bundle.declare(Online, 'net')
const Model = Schema.Struct({ ...OnlineDeclared.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...OnlineDeclared.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

describe('Online transitions', () => {
  it('starts from navigator.onLine and follows Changed', () => {
    const placed = Page.at(OnlineDeclared)
    for (const online of [true, false]) {
      Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true })
      expect(placed.init({ net: { online: !online } }).model.net).toEqual({ online })
    }
    const changed = placed.update(
      { net: { online: true } },
      OnlineDeclared.wrapper.make(OnlineMessage.Changed({ online: false })),
    )
    expect(Option.getOrThrow(changed).model.net).toEqual({ online: false })
  })
})

describe('Online stream', () => {
  const changes = () => Online.subscriptions!().changes!
  const streamFor = (model: OnlineModel) => {
    const entry = changes()
    return entry.dependenciesToStream(entry.modelToDependencies(model), () => ({}))
  }

  it('emits offline then online as window events fire', async () => {
    const stream = streamFor({ online: true })
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(stream, 2))
        // Let both event branches subscribe before firing; the timeout in
        // takeMessages turns a genuine stall red instead of hanging.
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        window.dispatchEvent(new Event('offline'))
        window.dispatchEvent(new Event('online'))
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      OnlineMessage.Changed({ online: false }),
      OnlineMessage.Changed({ online: true }),
    ])
  })
})

describe('Online in an assembly', () => {
  it('routes Changed and carries init and subscriptions', () => {
    const assembly = Page.assemble(Page.at(OnlineDeclared))
    const update = assembly.update(model => ({ model }))
    const changed = update(
      { net: { online: true } },
      OnlineDeclared.wrapper.make(OnlineMessage.Changed({ online: false })),
    )
    expect(changed.model.net).toEqual({ online: false })
    expect(Object.keys(assembly.subscriptions())).toEqual(['Online@net/changes'])
  })
})

afterEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
})
