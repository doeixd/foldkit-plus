// @vitest-environment jsdom
/**
 * `Resource.lazy` as an entry of Foldkit's `resources`: a Command reads the
 * service with `Resource.get`, waits for the import, and its Message lands.
 */
import { Context, Effect, Layer, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { Resource } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

class Greeter extends Context.Service<Greeter, { readonly greet: (name: string) => string }>()(
  'test/RuntimeGreeter',
) {}

const Model = Schema.Struct({ greeting: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Greeted: { text: Schema.String } })
type Message = typeof Message.Type

const Greet = Command.define('Greet', {
  messages: [Message.Greeted],
  execute: Effect.gen(function* () {
    const greeter = yield* Resource.get(Greeter)
    return Message.Greeted({ text: greeter.greet('Ada') })
  }).pipe(
    Effect.catchTag('ResourceLoadError', () =>
      Effect.succeed(Message.Greeted({ text: 'offline' })),
    ),
  ),
})

it('runs a Command that reads a lazy resource once its chunk has loaded', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'resource-runtime'
  document.body.appendChild(container)
  let release: () => void = () => {}
  const imported = new Promise<Layer.Layer<Greeter>>(resolve => {
    release = () => resolve(Layer.succeed(Greeter, { greet: name => `Hello, ${name}` }))
  })

  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { greeting: '…' }, commands: [Greet()] }),
      update: (model: Model, message: Message) =>
        Message.match(message, { Greeted: ({ text }) => ({ model: { greeting: text } }) }),
      view: (model: Model, h: HtmlBuilder<Message>) => h.p([h.Class('greeting')], [model.greeting]),
      resources: Resource.lazy(Greeter, () => imported),
    }),
  )
  const text = () => document.querySelector('.greeting')?.textContent
  try {
    await vi.waitFor(() => expect(text()).toBe('…'))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(text()).toBe('…')
    release()
    await vi.waitFor(() => expect(text()).toBe('Hello, Ada'))
  } finally {
    handle.dispose()
  }
})
