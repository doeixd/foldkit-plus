/**
 * A durable write whose answer a gateway lost, end to end: the server applies
 * it and records it in the ledger, the client is handed `{}` instead of the
 * answer, and the outbox, told the write is `Unreachable`, sends it again
 * under the same operation id. The ledger answers that from its record, so
 * the increment lands once and the write settles (#282).
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Write } from 'foldkit-entity'
import { Mutation, Remote, RemoteClient, type RemoteMessage } from 'foldkit-remote'
import { outbox, outboxStatus } from 'foldkit-remote/outbox'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

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

// An increment that expects no revision: sent twice without the ledger, it would add twice.
const Restock = Mutation.write(
  'Restock',
  Write.update(
    Entity.input(Item, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(`
  create table items (id text primary key, stock integer not null);
  create table write_ledger (
    scope text not null, operation text not null, target text not null, answer text not null, at integer not null, request text,
    primary key (scope, operation, target)
  );
  insert into items values ('i1', 10);`)

const server = RemoteServer.make<string, DrizzleDatabase>({
  entities: [],
  mutations: [
    RemoteServer.write(
      Restock,
      writer<string>(Db.Item, { ledger: { table: ledgerTable, scope: principal => principal } }),
    ),
  ],
})
const handlers = RemoteServer.handlers(server, 'ada')

/** The operation id of each request that reached the server. */
const operations: Array<unknown> = []
let lost = false
/** The server behind a gateway that loses its first answer, handing back `{}` instead. */
const client = Remote.json(async request => {
  const parsed = JSON.parse(request) as { readonly payload: { readonly operation?: string } }
  operations.push(parsed.payload.operation)
  const { body } = await Effect.runPromise(
    RemoteServer.answer(handlers, parsed).pipe(
      Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
    ),
  )
  if (lost) return body
  lost = true
  return {}
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item], mutations: [Restock] })
const durable = outbox(Data, {
  key: () => 'outbox:ada',
  scope: () => 'ada',
  retry: { base: '1 millis', max: '2 millis' },
})
const entries = durable.subscriptions!

const kv = Effect.runSync(
  Effect.gen(function* () {
    return yield* KeyValueStore.KeyValueStore
  }).pipe(Effect.provide(KeyValueStore.layerMemory)),
)

/** What one outbox entry's stream sends for the Model, collected, as the runtime runs it. */
const step = (name: 'outbox.save' | 'outbox.send', model: Model) => {
  const entry = entries[name]!
  const dependencies = entry.modelToDependencies(model)
  return Effect.runPromise(
    Stream.runCollect(
      entry.dependenciesToStream(dependencies as never, () => dependencies as never),
    ).pipe(
      Effect.provideService(KeyValueStore.KeyValueStore, kv),
      Effect.provide(Remote.clientLayer(client)),
    ),
  ).then(collected => [...collected] as ReadonlyArray<RemoteMessage>)
}

it('sends a write whose answer was not an answer again, and settles it from the ledger', async () => {
  const start = await Effect.runPromise(
    durable
      .restore({ remote: Remote.initial })
      .pipe(Effect.provideService(KeyValueStore.KeyValueStore, kv)),
  )
  const queued = Data.mutate(
    start,
    Restock,
    { id: 'i1', quantity: 2 },
    { durable: true, now: Date.now() },
  )
  const saved = (await step('outbox.save', queued.model)).reduce(Data.reduce, queued.model)
  const messages = await step('outbox.send', saved)

  expect(messages.map(message => message._tag)).toEqual(['OutboxDelayed', 'MutationSucceeded'])
  // Both sends carried the write's own operation id, which the ledger keys its record by.
  expect(operations).toEqual([queued.requestId, queued.requestId])
  // The first send landed; the second was answered from the record, not applied again.
  expect(sqlite.prepare("select stock from items where id = 'i1'").get()).toEqual({ stock: 12 })
  expect(messages[1]).toMatchObject({
    entities: [{ entity: 'Item', id: 'i1', values: { stock: 12 } }],
  })
  const settled = messages.reduce(Data.reduce, saved)
  expect(outboxStatus(Data, settled)).toMatchObject({ waiting: 0, failed: 0, items: [] })
  expect(Data.mutation(settled, queued.requestId)._tag).toBe('Applied')
})
