/**
 * A create of a taken id, end to end over SQLite: the server refuses it as
 * `Taken` (a 409 over HTTP), every transport carries the refusal, and the
 * client settles it as a refusal, an ordinary write and a durable one alike,
 * while a retry of the create that made the row is answered from the ledger.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Write } from 'foldkit-entity'
import {
  Mutation,
  Remote,
  RemoteClient,
  type RemoteJsonClient,
  type RemoteMessage,
} from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { beforeEach, describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, stock: Schema.Int }))
const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  stock: integer('stock').notNull(),
})
const ledgerTable = sqliteTable(
  'write_ledger',
  {
    scope: text('scope').notNull(),
    operation: text('operation').notNull(),
    target: text('target').notNull(),
    answer: text('answer').notNull(),
    at: integer('at').notNull(),
    request: text('request'),
  },
  table => [primaryKey({ columns: [table.scope, table.operation, table.target] })],
)
const Db = bind({ Item }, { Item: { table: items } })

const CreateItem = Mutation.write(
  'CreateItem',
  Write.insert(Entity.input(Item, Schema.Struct({ id: Schema.String, stock: Schema.Int })), {
    id: 'id',
  }),
)

let sqlite = new DatabaseSync(':memory:')
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table items (id text primary key, stock integer not null);
    create table write_ledger (
      scope text not null, operation text not null, target text not null, answer text not null, at integer not null, request text,
      primary key (scope, operation, target)
    );
    insert into items values ('i1', 10);`)
})
const database = () => databaseLayer(drizzle({ client: sqlite }))

const server = RemoteServer.make<string, DrizzleDatabase>({
  entities: [source(Db.Item)],
  mutations: [
    RemoteServer.write(
      CreateItem,
      writer<string>(Db.Item, { ledger: { table: ledgerTable, scope: principal => principal } }),
    ),
  ],
})
const handlers = RemoteServer.handlers(server, 'ada')

/** The status of each answer `Remote.http` received. */
let statuses: Array<number> = []
beforeEach(() => {
  statuses = []
})
const answered = (request: string) =>
  Effect.runPromise(
    RemoteServer.answer(handlers, JSON.parse(request)).pipe(Effect.provide(database())),
  )
const http = Remote.http('https://example.test/remote', {
  fetch: async (_url, init) => {
    const { status, body } = await answered(String(init?.body))
    statuses.push(status)
    return Response.json(body, { status })
  },
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item], mutations: [CreateItem] })

const transports: ReadonlyArray<readonly [string, () => Layer.Layer<RemoteClient>]> = [
  ['Remote.http', () => Remote.clientLayer(http)],
  [
    'Remote.json',
    () => Remote.clientLayer(Remote.json(async request => (await answered(request)).body)),
  ],
  ['RPC handlers', () => Remote.clientLayer(handlers).pipe(Layer.provide(database()))],
]

/** Runs a started write's Command over `layer` and reduces what it answers. */
const settle = async (
  started: {
    readonly model: Model
    readonly command: { readonly effect: Effect.Effect<RemoteMessage, never, RemoteClient> }
  },
  layer: Layer.Layer<RemoteClient>,
) => {
  const message = await Effect.runPromise(started.command.effect.pipe(Effect.provide(layer)))
  return { message, model: Data.reduce(started.model, message) }
}

describe.each(transports)('a create of a taken id over %s', (_name, layer) => {
  it('is settled as a Taken refusal, naming only the Entity and the id', async () => {
    const started = Data.mutate({ remote: Remote.initial }, CreateItem, { id: 'i1', stock: 3 })
    const { message, model } = await settle(started, layer())
    expect(message).toMatchObject({
      _tag: 'MutationFailed',
      error: {
        _tag: 'RemoteMutationError',
        message: 'Item i1 is already taken',
        refusal: { _tag: 'Taken', entity: 'Item', id: 'i1' },
      },
    })
    // As sent, before any decoder drops a key: nothing of the row there, which may be hidden.
    expect(JSON.parse(JSON.stringify(message)).error.refusal).toEqual({
      _tag: 'Taken',
      entity: 'Item',
      id: 'i1',
    })
    const [failed] = Data.failedWrites(model, CreateItem)
    expect(failed?.refusal).toEqual(Option.some({ _tag: 'Taken', entity: 'Item', id: 'i1' }))
    expect(sqlite.prepare("select stock from items where id = 'i1'").get()).toEqual({ stock: 10 })
  })
})

it('answers a create of a taken id with 409, and a free one with 200', async () => {
  const layer = Remote.clientLayer(http)
  await settle(Data.mutate({ remote: Remote.initial }, CreateItem, { id: 'i1', stock: 3 }), layer)
  await settle(Data.mutate({ remote: Remote.initial }, CreateItem, { id: 'i2', stock: 3 }), layer)
  expect(statuses).toEqual([409, 200])
})

describe('a durable create', () => {
  const outbox = Data.outbox({
    key: () => 'outbox:ada',
    scope: () => 'ada',
    retry: { base: '1 millis', max: '2 millis' },
  })
  const entries = outbox.subscriptions!
  const kv = () =>
    Effect.runSync(
      Effect.gen(function* () {
        return yield* KeyValueStore.KeyValueStore
      }).pipe(Effect.provide(KeyValueStore.layerMemory)),
    )

  /** The outbox over `client`, its entries run as the runtime runs them. */
  const outboxOver = async (client: RemoteJsonClient) => {
    const store = kv()
    const step = (name: 'outbox.save' | 'outbox.send', model: Model) => {
      const entry = entries[name]!
      const dependencies = entry.modelToDependencies(model)
      return Effect.runPromise(
        Stream.runCollect(
          entry.dependenciesToStream(dependencies as never, () => dependencies as never),
        ).pipe(
          Effect.provideService(KeyValueStore.KeyValueStore, store),
          Effect.provide(Remote.clientLayer(client)),
        ),
      ).then(collected => [...collected] as ReadonlyArray<RemoteMessage>)
    }
    const start = await Effect.runPromise(
      outbox
        .restore({ remote: Remote.initial })
        .pipe(Effect.provideService(KeyValueStore.KeyValueStore, store)),
    )
    /** Queues a create, saves it, sends it, and reduces what the send answered. */
    const created = async (id: string) => {
      const queued = Data.mutate(start, CreateItem, { id, stock: 3 }, { durable: true, now: 0 })
      const saved = (await step('outbox.save', queued.model)).reduce(Data.reduce, queued.model)
      const messages = await step('outbox.send', saved)
      return { queued, messages, settled: messages.reduce(Data.reduce, saved) }
    }
    return { created }
  }

  it('fails once as refused and is never sent again', async () => {
    const { created } = await outboxOver(http)
    const { messages, settled, queued } = await created('i1')
    expect(messages.map(message => message._tag)).toEqual(['MutationFailed'])
    expect(statuses).toEqual([409])
    expect(Data.outboxStatus(settled)).toMatchObject({ waiting: 0, failed: 1 })
    expect(Data.failedWrites(settled, CreateItem)).toEqual([
      expect.objectContaining({
        requestId: queued.requestId,
        refusal: Option.some({ _tag: 'Taken', entity: 'Item', id: 'i1' }),
      }),
    ])
  })

  it('whose answer was lost is answered from its record when sent again, not refused', async () => {
    let lost = false
    const sent: Array<number> = []
    // A gateway that loses the first answer, handing back `{}` instead.
    const gateway = Remote.json(async request => {
      const { status, body } = await answered(request)
      sent.push(status)
      if (lost) return body
      lost = true
      return {}
    })
    const { created } = await outboxOver(gateway)
    const { messages, settled, queued } = await created('i2')
    expect(messages.map(message => message._tag)).toEqual(['OutboxDelayed', 'MutationSucceeded'])
    expect(sent).toEqual([200, 200])
    expect(Data.mutation(settled, queued.requestId)._tag).toBe('Applied')
    expect(sqlite.prepare("select stock from items where id = 'i2'").get()).toEqual({ stock: 3 })
  })
})

it('holds a client that showed the create as made to the Taken refusal (Law.check)', async () => {
  const report = await Effect.runPromise(
    Law.check(Data, {
      model: { remote: Remote.initial },
      holds: [],
      mutation: CreateItem,
      input: { id: 'i1', stock: 3 },
      now: 0,
    }).pipe(Effect.provide(Remote.clientLayer(handlers).pipe(Layer.provide(database())))),
  )
  expect(report.disagreed).toEqual([
    {
      part: 'CreateItem',
      when: 'pending',
      client: 'applied',
      server: { _tag: 'Taken', entity: 'Item', id: 'i1' },
    },
  ])
})
