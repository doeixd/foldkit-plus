// @vitest-environment jsdom
/**
 * Two placements of one bundle on the real Foldkit runtime: gated
 * Subscriptions start and stop with the Model, a Managed Resource is acquired
 * and released, and clicks in each placed view reach only that placement.
 */
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import { afterEach, expect, it, vi } from 'vitest'
import { Bundle, Link } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const ChildModel = Schema.Struct({
  count: Schema.Number,
  live: Schema.Boolean,
  socket: Schema.String,
})
type ChildModel = typeof ChildModel.Type
const ChildMessage = defineMessageUnion({
  Clicked: {},
  Toggled: {},
  Ticked: {},
  Opened: { url: Schema.String },
  Closed: {},
  Failed: {},
})
type ChildMessage = typeof ChildMessage.Type

// One tick source per placement, so neither placement's stream can consume the other's ticks.
const ticks = {
  a: Effect.runSync(Queue.unbounded<void>()),
  b: Effect.runSync(Queue.unbounded<void>()),
}
const released: Array<string> = []

const makeTicker = (resourceKey: string) =>
  Bundle.make({
    name: 'Ticker',
    Model: ChildModel,
    Message: ChildMessage,
    init: (_: { readonly id: 'a' | 'b' }) => ({
      model: { count: 0, live: false, socket: 'closed' },
    }),
    update: (model, message) => {
      switch (message._tag) {
        case 'Clicked':
        case 'Ticked':
          return { model: { ...model, count: model.count + 1 } }
        case 'Toggled':
          return { model: { ...model, live: !model.live } }
        case 'Opened':
          return { model: { ...model, socket: message.url } }
        case 'Closed':
          return { model: { ...model, socket: 'closed' } }
        case 'Failed':
          return { model }
      }
    },
    subscriptions: ({ id }) =>
      Subscription.make<ChildModel, ChildMessage>()(entry => ({
        ticks: entry(
          { live: Schema.Boolean },
          {
            modelToDependencies: model => ({ live: model.live }),
            dependenciesToStream: ({ live }) =>
              live
                ? Stream.fromQueue(ticks[id]).pipe(Stream.map(() => ChildMessage.Ticked()))
                : Stream.empty,
          },
        ),
      })),
    resources: ({ id }) =>
      ManagedResource.make<ChildModel, ChildMessage>()(entry => ({
        socket: entry(Schema.Option(Schema.String), {
          resource: ManagedResource.tag<string>()(resourceKey),
          modelToMaybeRequirements: model =>
            model.live ? Option.some(`ws://${id}`) : Option.none(),
          acquire: url => Effect.succeed(url),
          release: url => Effect.sync(() => void released.push(url)),
          onAcquired: url => ChildMessage.Opened({ url }),
          onReleased: () => ChildMessage.Closed(),
          onAcquireError: () => ChildMessage.Failed(),
        }),
      })),
    view: Submodel.defineView<ChildModel, ChildMessage>((model, h) =>
      h.div(
        [],
        [
          h.button([h.Class('count'), h.OnClick(ChildMessage.Clicked())], [String(model.count)]),
          h.button([h.Class('toggle'), h.OnClick(ChildMessage.Toggled())], ['toggle']),
          h.span([h.Class('socket')], [model.socket]),
        ],
      ),
    ),
  })

const GotAMessage = Link.wrapper('GotAMessage', ChildMessage)
const GotBMessage = Link.wrapper('GotBMessage', ChildMessage)
const Model = Schema.Struct({ a: ChildModel, b: ChildModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotAMessage.cases, ...GotBMessage.cases })
type Message = typeof Message.Type

// Each placement gets its own resource tag: one tag per placement is what the runtime provides.
const A = makeTicker('socket-a').at(Link.field<Model>()('a', GotAMessage), { args: { id: 'a' } })
const B = makeTicker('socket-b').at(Link.field<Model>()('b', GotBMessage), { args: { id: 'b' } })
const placements = Bundle.assemble<Model, Message>()([A, B])

const empty: ChildModel = { count: 0, live: false, socket: 'closed' }
const text = (selector: string) => document.querySelector(selector)?.textContent
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click()

it('runs two placements of one bundle independently on the Foldkit runtime', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  // The runtime renders into its container by id.
  container.id = 'bundle-runtime'
  document.body.appendChild(container)

  const program = Runtime.makeElement(
    placements.complete({
      Model,
      container,
      init: () => placements.init({ a: empty, b: empty }),
      update: (model: Model, message: Message) =>
        Option.getOrElse(placements.update(model, message), () => ({ model })),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.main(
          [],
          [h.section([h.Id('a')], [A.view(model, h)]), h.section([h.Id('b')], [B.view(model, h)])],
        ),
      subscriptions: placements.subscriptions(),
      managedResources: placements.resources(),
    }),
  )
  const handle = Runtime.embed(program)
  try {
    await vi.waitFor(() => expect(text('#a .count')).toBe('0'))

    click('#a .count')
    await vi.waitFor(() => expect(text('#a .count')).toBe('1'))
    expect(text('#b .count')).toBe('0')

    click('#b .toggle')
    await vi.waitFor(() => expect(text('#b .socket')).toBe('ws://b'))
    expect(text('#a .socket')).toBe('closed')

    Effect.runSync(Queue.offer(ticks.b, undefined))
    await vi.waitFor(() => expect(text('#b .count')).toBe('1'))
    // A is not live, so its Subscription is not running and its tick waits in the queue.
    Effect.runSync(Queue.offer(ticks.a, undefined))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(text('#a .count')).toBe('1')
    click('#a .toggle')
    await vi.waitFor(() => expect(text('#a .count')).toBe('2'))
    click('#a .toggle')
    await vi.waitFor(() => expect(text('#a .socket')).toBe('closed'))

    click('#b .toggle')
    await vi.waitFor(() => expect(text('#b .socket')).toBe('closed'))
    expect(released).toEqual(['ws://a', 'ws://b'])
    expect(text('#a .count')).toBe('2')
  } finally {
    handle.dispose()
  }
})
