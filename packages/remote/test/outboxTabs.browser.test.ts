/**
 * Two tabs on one outbox, in a real browser: two runtimes in one page share
 * its `localStorage`, its Web Locks and its `BroadcastChannel`s, as two tabs
 * of one origin do. A write queued in one shows in the other, is sent once,
 * and settles in both with the server's answer; one no one is signed in to
 * send waits for a sign-in in both.
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
  RemotePrincipalChanged,
  RemoteUnauthenticated,
  isRemoteMessage,
  terminal,
} from '../src/index.js'
import { outbox, outboxStatus } from '../src/outbox.js'

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  sent.length = 0
  signedOut = false
  atOnce = false
  moves.length = 0
  cookie = undefined
  ran.length = 0
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
const Message = defineMessageUnion({ ...Remote.messages, Pressed: {}, SignedIn: {} })
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

/** Each `OutboxMoved` any tab said, by the operations it named. */
const moves: Array<ReadonlyArray<string>> = []

const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> => {
  if (message._tag === 'OutboxMoved') moves.push(message.requestIds)
  if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
  if (message._tag === 'SignedIn') return { model: Data.signedIn(model) }
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
      h.p([h.Class('signIn')], [String(outboxStatus(Data, model).waitingForSignIn)]),
      h.button([h.Class('press'), h.OnClick(Message.Pressed())], ['Set']),
      h.button([h.Class('signedIn'), h.OnClick(Message.SignedIn())], ['Signed in']),
    ],
  )
}

/**
 * One server both tabs reach: it answers once a test lets it, or at once
 * `Unauthenticated` while `signedOut`, and counts what reached it.
 */
const sent: Array<string | undefined> = []
let answer: () => void = () => undefined
let signedOut = false
/** Answers each write as it arrives, rather than when a test lets it. */
let atOnce = false
/**
 * Whom the session cookie names, `null` no one: given, the server judges a
 * write's `principal` as `RemoteServer.handlers` does, and `ran` lists what
 * ran, and as whom it was sent.
 */
let cookie: string | null | undefined = undefined
const ran: Array<{ readonly operation: string | undefined; readonly as: unknown }> = []
const applied = {
  output: {},
  entities: [{ entity: 'Item', id: 'i1', values: { count: 2 } }],
  connections: [],
  deleted: [],
}
const client: RemoteClient['Service'] = {
  read: () => Effect.succeed({ settled: [], entities: [] }),
  query: () => Effect.succeed({ edges: [], start: terminal, end: terminal }),
  mutate: request =>
    atOnce
      ? Effect.sync(() => sent.push(request.operation)).pipe(
          Effect.andThen(
            cookie !== undefined && request.principal !== undefined && request.principal !== cookie
              ? Effect.fail(new RemotePrincipalChanged({ message: 'Someone else' }))
              : Effect.sync(() =>
                  ran.push({ operation: request.operation, as: request.principal }),
                ),
          ),
          Effect.as(applied),
        )
      : signedOut
        ? Effect.sync(() => sent.push(request.operation)).pipe(
            Effect.andThen(
              Effect.fail(new RemoteUnauthenticated({ message: 'Your session ended.' })),
            ),
          )
        : Effect.promise(
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

/** How long a tab's store takes to read and to write, as one under load does. */
interface Lag {
  /** The wait before each read, asked once per read. */
  readonly get: () => number
  readonly set: number
}
const slowStore = (lag: Lag) =>
  Layer.effect(
    KeyValueStore.KeyValueStore,
    Effect.map(Effect.service(KeyValueStore.KeyValueStore), base =>
      KeyValueStore.make({
        ...base,
        get: key => Effect.andThen(Effect.sleep(lag.get()), base.get(key)),
        set: (key, value) => Effect.andThen(Effect.sleep(lag.set), base.set(key, value)),
      }),
    ),
  ).pipe(Layer.provide(KeyValueStore.layerStorage(() => localStorage)))

/** A tab: the application in a section of its own, over the page's `localStorage`. */
const tab = (name: string, start: Model = initial, lag: Lag = { get: () => 0, set: 0 }) => {
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
      flags: durable.restore(start),
      init: (model: Model) => ({ model }),
      update,
      view,
      subscriptions: durable.subscriptions!,
      container,
      resources: Layer.merge(Layer.succeed(RemoteClient, client), slowStore(lag)),
    }),
  )
  const read = (part: string) => section.querySelector(`.${part}`)?.textContent
  const click = (part: string) => (section.querySelector(`.${part}`) as HTMLElement).click()
  return { handle, read, press: () => click('press'), signIn: () => click('signedIn') }
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

it('sends a write once when the tab that sent it stops waiting for the answer before storing it', async () => {
  // The sending tab's store is slow to write and the other's slow to read, as under load:
  // the answer settles the sender's queue, which ends its send, while it is still writing,
  // and the other tab takes the lock before it has heard the answer.
  const a = tab('a', initial, { get: () => 0, set: 300 })
  let late = false
  const b = tab('b', initial, {
    get: () => {
      const wait = late ? 150 : 0
      late = false
      return wait
    },
    set: 0,
  })
  try {
    await vi.waitFor(() => expect([a.read('count'), b.read('count')]).toEqual(['1', '1']))
    a.press()
    await vi.waitFor(() => expect([a.read('waiting'), b.read('waiting')]).toEqual(['1', '1']))
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    late = true
    answer()
    await vi.waitFor(() => expect([a.read('waiting'), b.read('waiting')]).toEqual(['0', '0']))
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(sent).toHaveLength(1)
  } finally {
    a.handle.dispose()
    b.handle.dispose()
  }
})

it('shows a write no one is signed in to send as waiting for a sign-in in both tabs, until one reports it', async () => {
  const a = tab('a')
  const b = tab('b')
  try {
    await vi.waitFor(() => expect([a.read('count'), b.read('count')]).toEqual(['1', '1']))
    signedOut = true
    a.press()
    await vi.waitFor(() => expect([a.read('signIn'), b.read('signIn')]).toEqual(['1', '1']))
    // Still shown, and sent once: no tab sends it again on its own.
    expect([a.read('count'), b.read('count')]).toEqual(['2', '2'])
    expect([a.read('waiting'), b.read('waiting')]).toEqual(['0', '0'])
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(sent).toHaveLength(1)
    // Signed in again, in the other tab: it is sent again, and settles in both.
    signedOut = false
    b.signIn()
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    await vi.waitFor(() => expect([a.read('signIn'), b.read('signIn')]).toEqual(['0', '0']))
    answer()
    await vi.waitFor(() => expect([a.read('waiting'), b.read('waiting')]).toEqual(['0', '0']))
    expect(sent[1]).toBe(sent[0])
    expect(JSON.parse(localStorage.getItem('tabs:ada') ?? '{}')).toMatchObject({ entries: [] })
  } finally {
    a.handle.dispose()
    b.handle.dispose()
  }
})

it("moves a visitor's writes once when two tabs race to: said once, none lost or sent twice (#405)", async () => {
  // A visitor's two writes, waiting for a sign-in, in the visitor's queue.
  const visitorWrite = (operation: string, count: number) => ({
    operation,
    mutation: 'SetCount',
    input: { id: 'i1', count },
    optimistic: [],
    shown: [],
    madeAs: { _tag: 'Visitor' },
    revision: 1,
    state: { _tag: 'WaitingForSignIn', error: { _tag: 'Unauthenticated', message: 'Sign in.' } },
  })
  localStorage.setItem(
    'tabs:visitor',
    JSON.stringify({
      version: 1,
      scope: 'visitor',
      entries: [visitorWrite('v-1', 2), visitorWrite('v-2', 3)],
      done: [],
    }),
  )
  // Both tabs held the visitor's queue, forgot it on Ada's sign-in, and heard her.
  const visitor = Data.reduce(
    { ...initial, actor: 'visitor' },
    { _tag: 'OutboxRead', key: 'tabs:visitor', scope: 'visitor', entries: [], done: [] },
  )
  const forgotten = { ...Data.forget(visitor), actor: 'ada' }
  const ada = Data.reduce(forgotten, {
    _tag: 'ReadReceived',
    requests: [],
    result: { entities: [], settled: [], principal: 'User:ada' },
    now: 0,
    generation: forgotten.remote.refresh.floor,
  })
  atOnce = true
  const a = tab('a', ada)
  const b = tab('b', ada)
  try {
    await vi.waitFor(() => expect([...sent].sort()).toEqual(['v-1', 'v-2']))
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(moves).toEqual([['v-1', 'v-2']])
    expect([...sent].sort()).toEqual(['v-1', 'v-2'])
    expect(JSON.parse(localStorage.getItem('tabs:visitor') ?? '{}')).toMatchObject({
      entries: [],
    })
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem('tabs:ada') ?? '{}')).toMatchObject({
        entries: [],
        done: expect.arrayContaining(['v-1', 'v-2']),
      }),
    )
  } finally {
    a.handle.dispose()
    b.handle.dispose()
  }
})

it("never runs a visitor's write unstamped as who signed in, while another tab moves it (#405)", async () => {
  localStorage.setItem(
    'tabs:visitor',
    JSON.stringify({
      version: 1,
      scope: 'visitor',
      owner: { _tag: 'Visitor' },
      entries: [
        {
          operation: 'v-1',
          mutation: 'SetCount',
          input: { id: 'i1', count: 2 },
          optimistic: [],
          shown: [],
          madeAs: { _tag: 'Visitor' },
          revision: 1,
          state: {
            _tag: 'WaitingForSignIn',
            error: { _tag: 'Unauthenticated', message: 'Sign in.' },
          },
        },
      ],
      done: [],
    }),
  )
  // Ada has signed in. One tab still holds the visitor's queue, and reports the sign-in
  // before any answer names her; the other holds hers, having heard her.
  cookie = 'User:ada'
  atOnce = true
  const visitor = Data.reduce(
    { ...initial, actor: 'visitor' },
    {
      _tag: 'ReadReceived',
      requests: [],
      result: { entities: [], settled: [], principal: null },
      now: 0,
      generation: 0,
    },
  )
  const held = Data.reduce(visitor, {
    _tag: 'OutboxRead',
    key: 'tabs:visitor',
    scope: 'visitor',
    entries: [],
    done: [],
  })
  const forgotten = { ...Data.forget(held), actor: 'ada' }
  const ada = Data.reduce(forgotten, {
    _tag: 'ReadReceived',
    requests: [],
    result: { entities: [], settled: [], principal: 'User:ada' },
    now: 0,
    generation: forgotten.remote.refresh.floor,
  })
  const b = tab('b', visitor)
  await vi.waitFor(() => expect(b.read('signIn')).toBe('1'))
  b.signIn()
  const a = tab('a', ada)
  try {
    await vi.waitFor(() => expect(ran).toEqual([{ operation: 'v-1', as: 'User:ada' }]))
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(ran).toEqual([{ operation: 'v-1', as: 'User:ada' }])
    expect(moves).toEqual([['v-1']])
  } finally {
    a.handle.dispose()
    b.handle.dispose()
  }
})
