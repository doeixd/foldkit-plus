/**
 * A like landed over someone else's, end to end: a page reads a count, sends
 * a like, and reads the count again after another reader's like landed. The
 * answer of a writer that moves the row's revision says the like landed right
 * after the count the page read, so the page settles on it with no second
 * read; a writer that keeps no revision leaves the page to read it again.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Write } from 'foldkit-entity'
import { Mutation, Remote, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, likes: Schema.Int, revision: Schema.Int }),
)
const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  likes: integer('likes').notNull(),
  revision: integer('revision').notNull(),
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

// An increment that expects no revision: the ledger keeps a retry from adding twice.
const Like = Mutation.write(
  'Like',
  Write.update(
    Entity.input(Item, Schema.Struct({ id: Schema.String, amount: Schema.Int }), {
      amount: Entity.unmapped,
    }),
    { id: 'id', increment: { likes: 'amount' } },
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item], mutations: [Like] })
const likes = Data.get(Entity.select(Item, { likes: true }), 'i1')
const requests = [{ entity: 'Item', id: 'i1', fields: ['likes'] }]

/** A database holding one row, and a server over it whose writer and source keep `revision`, or none. */
const serving = (revised: boolean) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table items (id text primary key, likes integer not null, revision integer not null);
    create table write_ledger (
      scope text not null, operation text not null, target text not null, answer text not null,
      at integer not null, request text, primary key (scope, operation, target)
    );
    insert into items values ('i1', 10, 1);`)
  const revision = revised ? { revision: 'revision' as const } : {}
  const server = RemoteServer.make<string, DrizzleDatabase>({
    entities: [source<string>(Db.Item, revision)],
    mutations: [
      RemoteServer.write(
        Like,
        writer<string>(Db.Item, {
          ledger: { table: ledgerTable, scope: principal => principal },
          ...revision,
        }),
      ),
    ],
  })
  const run = <A, E>(
    principal: string,
    ask: (handlers: ReturnType<typeof handlersOf>) => Effect.Effect<A, E, DrizzleDatabase>,
  ) =>
    Effect.runPromise(
      ask(handlersOf(principal)).pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
  const handlersOf = (principal: string) => RemoteServer.handlers(server, principal)
  const read = (now: number) =>
    run('ada', handlers =>
      Effect.map(
        handlers.FoldkitRemoteRead({ version: REMOTE_PROTOCOL_VERSION, requests }),
        result => ({ _tag: 'ReadReceived' as const, requests, result, now }),
      ),
    )
  const like = (principal: string, operation: string) =>
    run(principal, handlers =>
      handlers.FoldkitRemoteMutate({
        requestId: operation,
        mutation: 'Like',
        input: { id: 'i1', amount: 1 },
        operation,
      }),
    )
  return { read, like }
}

describe('a like landed over another reader’s', () => {
  it.each([
    { name: 'a writer that moves the revision settles it', revised: true, rereads: false },
    { name: 'a writer that keeps none reads it again', revised: false, rereads: true },
  ])('through $name', async ({ revised, rereads }) => {
    const { read, like } = serving(revised)
    const start: Model = { remote: Remote.initial }
    const known = Data.reduce(start, await read(0))
    const sent = Data.mutate(known, Like, { id: 'i1', amount: 1 }, { requestId: 'a' }).model
    // Another reader's like lands first, and the page reads the count it left.
    await like('bob', 'bob-1')
    const during = Data.reduce(sent, await read(1))
    const answer = await like('ada', 'a')
    expect(answer.entities[0]?.revision).toBe(revised ? 3 : undefined)
    const settled = Data.reduce(during, {
      _tag: 'MutationSucceeded',
      requestId: 'a',
      entities: answer.entities,
      now: 2,
    })
    expect(likes.read(settled)).toMatchObject({ value: { likes: 12 } })
    expect(Data.plan(settled, likes).length > 0).toBe(rereads)
  })
})
