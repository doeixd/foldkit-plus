// @vitest-environment jsdom
/**
 * A durable write across a real reload: a page on the Foldkit runtime makes
 * it while nothing answers, and goes; a new runtime over the same store
 * starts from the outbox's restore, shows the write from its first frame,
 * and sends it with the same operation id and the same `now`.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Entity, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { afterEach, expect, it, vi } from 'vitest'
import {
  Mutation,
  Remote,
  RemoteClient,
  RemoteUnreachable,
  isRemoteMessage,
  terminal,
} from '../src/index.js'
import { outbox, outboxStatus } from '../src/outbox.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, count: Schema.Number }))
const SetCount = Mutation.write(
  'SetCount',
  Write.update(Entity.input(Item, Schema.Struct({ id: Schema.String, count: Schema.Number })), {
    id: 'id',
  }),
)

const Model = Schema.Struct({ remote: Remote.Model, actor: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Pressed: {} })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Item], mutations: [SetCount] })
const durable = outbox(Data, {
  key: model => `outbox:${model.actor}`,
  scope: model => model.actor,
  retry: { base: '20 millis', max: '40 millis' },
})

const initial: Model = Data.reduce(
  { remote: Remote.initial, actor: 'ada' },
  {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Item', id: 'i1', fields: ['id', 'count'] }],
    result: {
      settled: [],
      entities: [{ entity: 'Item', id: 'i1', values: { id: 'i1', count: 1 } }],
    },
    now: 0,
  },
)

const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> => {
  if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
  const started = Data.mutate(model, SetCount, { id: 'i1', count: 2 }, { durable: true, now: 4321 })
  return { model: started.model, commands: [started.command] }
}

const Counted = Entity.select(Item, { count: true })
const view = (model: Model, h: HtmlBuilder<Message>) => {
  const read = Data.get(Counted, 'i1').read(model)
  return h.main(
    [],
    [
      h.p([h.Id('count')], [read._tag === 'Ready' ? String(read.value.count) : read._tag]),
      h.p([h.Id('waiting')], [String(outboxStatus(Data, model).waiting)]),
      h.button([h.Id('press'), h.OnClick(Message.Pressed())], ['Set']),
    ],
  )
}

/** A server that never answers while `offline`, and what reached it. */
const server = (offline: boolean) => {
  const sent: Array<{ readonly operation: string | undefined; readonly now: number | undefined }> =
    []
  const client: RemoteClient['Service'] = {
    read: () => Effect.succeed({ settled: [], entities: [] }),
    query: () => Effect.succeed({ edges: [], start: terminal, end: terminal }),
    mutate: request => {
      sent.push({ operation: request.operation, now: request.now })
      return offline
        ? Effect.fail(new RemoteUnreachable({ message: 'offline' }))
        : Effect.succeed({
            output: {},
            entities: [{ entity: 'Item', id: 'i1', values: { count: 2 } }],
            connections: [],
            deleted: [],
          })
    },
    live: () => Stream.empty,
  }
  return { sent, client }
}

const text = (id: string) => document.getElementById(id)?.textContent

/** A page of the application on the runtime, over `kv`, started from the outbox's restore. */
const open = (kv: KeyValueStore.KeyValueStore, client: RemoteClient['Service']) => {
  const container = document.createElement('div')
  container.id = `page-${Math.random().toString(36).slice(2)}`
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      Flags: Model,
      flags: durable.restore(initial),
      init: (model: Model) => ({ model }),
      update,
      view,
      subscriptions: durable.subscriptions!,
      container,
      resources: Layer.merge(
        Layer.succeed(RemoteClient, client),
        Layer.succeed(KeyValueStore.KeyValueStore, kv),
      ),
    }),
  )
}

it('keeps a write made offline across a reload, and sends it as itself', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const kv = Effect.runSync(
    Effect.gen(function* () {
      return yield* KeyValueStore.KeyValueStore
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  const offline = server(true)
  const first = open(kv, offline.client)
  try {
    await vi.waitFor(() => expect(text('count')).toBe('1'))
    ;(document.getElementById('press') as HTMLElement).click()
    await vi.waitFor(() => expect(text('count')).toBe('2'))
    await vi.waitFor(() => expect(offline.sent.length).toBeGreaterThan(1))
    expect(text('waiting')).toBe('1')
  } finally {
    first.dispose()
  }
  document.body.innerHTML = ''
  expect(Effect.runSync(kv.get('outbox:ada'))).toContain('"now":4321')

  const online = server(false)
  const second = open(kv, online.client)
  try {
    await vi.waitFor(() => expect(text('count')).toBe('2'))
    await vi.waitFor(() => expect(text('waiting')).toBe('0'))
    expect(online.sent).toEqual([{ operation: offline.sent[0]!.operation, now: 4321 }])
    expect(offline.sent.every(each => each.operation === online.sent[0]!.operation)).toBe(true)
  } finally {
    second.dispose()
  }
})
