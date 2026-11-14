/**
 * A source given its binding's revision sends it with every row it reads,
 * asked for or not, and a server mounting it puts it on the wire (#544), so
 * a client never lets an older answer over a newer row.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Fiber, Layer, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { Entity } from 'foldkit-entity'
import { REMOTE_PROTOCOL_VERSION, type LiveChange } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, pollLive, source } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, name: Schema.String, revision: Schema.Number }),
)
const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  revision: integer('revision').notNull(),
})
const Labeled = Entity.define('Labeled', Schema.Struct({ id: Schema.String, name: Schema.String }))
const labeled = sqliteTable('labeled', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})
const Db = bind({ Item, Labeled }, { Item: { table: items }, Labeled: { table: labeled } })

const database = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    "create table items (id text primary key, name text not null, revision integer not null); insert into items values ('i1', 'Lamp', 7)",
  )
  return databaseLayer(drizzle({ client: sqlite }))
}

describe('source with a revision', () => {
  it('sends each row its revision, and no revision value it was not asked', async () => {
    const records = await Effect.runPromise(
      source(Db.Item, { revision: 'revision' })
        .read({ ids: ['i1'], fields: ['name'], principal: undefined })
        .pipe(Effect.provide(database())),
    )
    expect(records.map(({ id, revision }) => ({ id, revision }))).toEqual([
      { id: 'i1', revision: 7 },
    ])
    const server = RemoteServer.make({ entities: [source(Db.Item, { revision: 'revision' })] })
    const answer = await Effect.runPromise(
      RemoteServer.handlers(server, undefined)
        .FoldkitRemoteRead({
          version: REMOTE_PROTOCOL_VERSION,
          requests: [{ entity: 'Item', id: 'i1', fields: ['name'] }],
        })
        .pipe(Effect.provide(database())),
    )
    expect(answer.entities).toEqual([
      { entity: 'Item', id: 'i1', values: { name: 'Lamp' }, revision: 7 },
    ])
  })

  it('sends no revision without one', async () => {
    const records = await Effect.runPromise(
      source(Db.Item)
        .read({ ids: ['i1'], fields: ['name'], principal: undefined })
        .pipe(Effect.provide(database())),
    )
    expect(records[0]?.revision).toBeUndefined()
  })

  it('is refused where it is made for a field with no number column', () => {
    expect(() => source(Db.Item, { revision: 'name' })).toThrow('is not a number column')
    // @ts-expect-error — a revision names a field of the binding.
    expect(() => source(Db.Labeled, { revision: 'revision' })).toThrow('has no column')
  })
})

describe('pollLive over a source with a revision', () => {
  it('sends the revision with a polled row patch', async () => {
    const client = new DatabaseSync(':memory:')
    client.exec(
      "create table items (id text primary key, name text not null, revision integer not null); insert into items values ('i1', 'Lamp', 7)",
    )
    const seen = await Effect.runPromise(
      Effect.gen(function* () {
        const seen: Array<typeof LiveChange.Type> = []
        const fiber = yield* pollLive(source(Db.Item, { revision: 'revision' }), {
          every: '1 second',
        })
          .subscribe({
            requirements: [{ entity: 'Item', id: 'i1', fields: ['name'] }],
            queries: [],
            after: 0,
            principal: undefined,
          })
          .pipe(
            Stream.runForEach(change => Effect.sync(() => void seen.push(change))),
            Effect.forkChild,
          )
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        client.exec("update items set name = 'Desk', revision = 8 where id = 'i1'")
        yield* TestClock.adjust('1 second')
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
        return seen
      }).pipe(
        Effect.provide(Layer.merge(TestClock.layer(), databaseLayer(drizzle({ client })))),
        Effect.ensuring(Effect.sync(() => client.close())),
      ),
    )
    expect(seen.filter(change => change._tag === 'EntityPatched').at(-1)).toMatchObject({
      values: { name: 'Desk' },
      revision: 8,
    })
  })
})
