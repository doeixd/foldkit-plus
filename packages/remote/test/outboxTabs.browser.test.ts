/**
 * Two tabs on one outbox, in a real browser: two runtimes in one page share
 * its `localStorage`, its Web Locks and its `BroadcastChannel`s, as two tabs
 * of one origin do. A write queued in one shows in the other, is sent once,
 * and settles in both with the server's answer.
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
import { Mutation, Remote, RemoteClient, isRemoteMessage, terminal } from '../src/index.js'
import { outbox, outboxStatus } from '../src/outbox.js'

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
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
const durable = outbox(Data, { key: model => `tabs:${model.actor}`, scope: model => model.actor })

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
  const started = Data.mutate(model, SetCount, { id: 'i1', count: 2 }, { durable: true })
  return { model: started.model, commands: [started.command] }
}

const Counted = Entity.select(Item, { count: true })
const view = (model: Model, h: HtmlBuilder<Message>) => {
  const read = Data.get(Counted, 'i1').read(model)
  return h.main(
    [],
    [
      h.p([h.Class('count')], [read._tag === 'Ready' ? String(read.value.count) : read._tag]),
      h.p([h.Class('waiting')], [String(outboxStatus(Data, model).waiting)]),
      h.button([h.Class('press'), h.OnClick(Message.Pressed())], ['Set']),
    ],
  )
}

/** One server both tabs reach: it answers once a test lets it, and counts what reached it. */
const sent: Array<string | undefined> = []
let answer: () => void = () => undefined
const client: RemoteClient['Service'] = {
  read: () => Effect.succeed({ settled: [], entities: [] }),
  query: () => Effect.succeed({ edges: [], start: terminal, end: terminal }),
  mutate: request =>
    Effect.promise(
      () =>
        new Promise<void>(resolve => {
          sent.push(request.operation)
          answer = resolve
        }),
    ).pipe(
      Effect.as({
        output: {},
        entities: [{ entity: 'Item', id: 'i1', values: { count: 2 } }],
        connections: [],
        deleted: [],
      }),
    ),
  live: () => Stream.empty,
}

/** A tab: the application in a section of its own, over the page's `localStorage`. */
const tab = (name: string) => {
  const section = document.createElement('section')
  section.className = name
  const container = document.createElement('div')
  container.id = `tab-${name}`
  section.appendChild(container)
  document.body.appendChild(section)
  const handle = Runtime.embed(
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
        KeyValueStore.layerStorage(() => localStorage),
      ),
    }),
  )
  const read = (part: string) => section.querySelector(`.${part}`)?.textContent
  return { handle, read, press: () => (section.querySelector('.press') as HTMLElement).click() }
}

it('shows a write queued in one tab in the other, sends it once, and settles both', async () => {
  const a = tab('a')
  const b = tab('b')
  try {
    await vi.waitFor(() => expect([a.read('count'), b.read('count')]).toEqual(['1', '1']))
    a.press()
    // The other tab reads it from the store: shown, and waiting, in both.
    await vi.waitFor(() => expect([a.read('count'), b.read('count')]).toEqual(['2', '2']))
    await vi.waitFor(() => expect([a.read('waiting'), b.read('waiting')]).toEqual(['1', '1']))
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    answer()
    await vi.waitFor(() => expect([a.read('waiting'), b.read('waiting')]).toEqual(['0', '0']))
    expect([a.read('count'), b.read('count')]).toEqual(['2', '2'])
    // The tab that did not send, holding the lock after, found it settled.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(sent).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('tabs:ada') ?? '{}')).toMatchObject({
      entries: [],
      done: [sent[0]],
    })
  } finally {
    a.handle.dispose()
    b.handle.dispose()
  }
})
