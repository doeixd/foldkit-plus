// @vitest-environment node
/**
 * A list read live over real SQLite, from the page through the handlers to
 * `pollLive` and back into the page's Model: a row that leaves the list's
 * window while it still exists is removed from the list, and stays a row; a
 * row written outside the query's filter never joins, with a row log or
 * without one.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Fiber, Layer, Option, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Query, Remote, type RemoteMessage } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, pollLive, query, rowChangeLog, rowLog, source } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull(),
})
const Db = bind({ Item }, { Item: { table: items } })

/** The active items, by id. */
const Active = Query.define('Active', {}, () =>
  Query.from(Item).pipe(
    Query.where(Expr.eq(Item.fields.status, 'active')),
    Query.orderBy(Order.asc(Item.fields.id)),
  ),
)
const Row = Entity.select(Item, { name: true, status: true })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item], queries: [Active] })

const listed = (first: number) => Data.query(Active, {}, { select: Row, first, live: true })

/**
 * A page reading the active items live, `first` of them, over a database
 * holding `rows`: the Model it holds once its list is read, then once each
 * `writes` statement has run and a tick has polled after it.
 */
const page = (
  rows: ReadonlyArray<readonly [string, string]>,
  first: number,
  writes: ReadonlyArray<string>,
  logged: boolean,
) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('create table items (id text primary key, name text not null, status text not null)')
  if (logged) for (const statement of rowChangeLog(Db.Item)) sqlite.exec(statement)
  for (const [id, status] of rows) {
    sqlite.exec(`insert into items values ('${id}', 'Item ${id}', '${status}')`)
  }
  const items = source<string>(Db.Item)
  const server = RemoteServer.make({
    entities: [items],
    queries: [query<string, {}>(Active, { entity: Db.Item })],
    live: [pollLive(items, { every: '1 second', ...(logged ? { changes: rowLog(Db.Item) } : {}) })],
  })
  const read = listed(first)
  const entry = Data.subscriptions({ list: Data.active('List', () => Option.some(read)) })[
    'list.live'
  ]
  return Effect.runPromise(
    Effect.gen(function* () {
      const loaded = yield* Data.prefetch({ remote: Remote.initial }, read)
      const sent: Array<RemoteMessage> = []
      const fiber = yield* Stream.runForEach(
        entry.dependenciesToStream(entry.modelToDependencies(loaded)),
        message => Effect.sync(() => sent.push(message)),
      ).pipe(Effect.forkChild)
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      for (const write of writes) {
        sqlite.exec(write)
        yield* TestClock.adjust('1 second')
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      }
      yield* Fiber.interrupt(fiber)
      const model = sent.reduce(Data.reduce, loaded)
      return {
        before: Data.visibleItems(loaded.remote, read.ref.identity).map(edge => edge.ref.id),
        after: Data.visibleItems(model.remote, read.ref.identity).map(edge => edge.ref.id),
        row: (id: string) => Data.get(Row, id).read(model),
        events: sent.flatMap(message =>
          message._tag === 'LiveReceived' ? [message.event._tag] : [],
        ),
      }
    }).pipe(
      Effect.provide(Remote.clientLayer(RemoteServer.handlers(server, 'ada'))),
      Effect.provide(Layer.merge(TestClock.layer(), databaseLayer(drizzle({ client: sqlite })))),
    ),
  )
}

describe.each([
  ['without a row log', false],
  ['with a row log', true],
])('a list read live over SQLite, %s', (_, logged) => {
  it('removes a row that leaves its filter, and keeps the row', async () => {
    const seen = await page(
      [
        ['a1', 'active'],
        ['a2', 'active'],
      ],
      5,
      ["update items set status = 'archived' where id = 'a1'"],
      logged,
    )
    expect(seen.row('a1')).toEqual({
      _tag: 'Ready',
      value: { name: 'Item a1', status: 'archived' },
    })
    expect(seen.before).toEqual(['a1', 'a2'])
    expect(seen.after).toEqual(['a2'])
    expect(seen.events).toContain('ConnectionRemove')
    expect(seen.events).not.toContain('EntityDeleted')
  })

  it('removes a row a new one pushes out of its window, and keeps the row', async () => {
    const seen = await page(
      [
        ['a2', 'active'],
        ['a3', 'active'],
      ],
      2,
      ["insert into items values ('a1', 'Item a1', 'active')"],
      logged,
    )
    expect(seen.row('a3')).toEqual({ _tag: 'Ready', value: { name: 'Item a3', status: 'active' } })
    expect(seen.before).toEqual(['a2', 'a3'])
    expect([...seen.after].sort()).toEqual(['a1', 'a2'])
    expect(seen.events).toContain('ConnectionRemove')
    expect(seen.events).not.toContain('EntityDeleted')
  })

  it('deletes a row that is gone', async () => {
    const seen = await page(
      [
        ['a1', 'active'],
        ['a2', 'active'],
      ],
      5,
      ["delete from items where id = 'a1'"],
      logged,
    )
    expect(seen.after).toEqual(['a2'])
    expect(seen.events).toContain('EntityDeleted')
    expect(seen.row('a1')._tag).not.toBe('Ready')
  })

  it('joins no row written outside its filter', async () => {
    const seen = await page(
      [['a1', 'active']],
      5,
      ["insert into items values ('b1', 'Item b1', 'archived')"],
      logged,
    )
    expect(seen.after).toEqual(['a1'])
    expect(seen.events).not.toContain('ConnectionInsert')
  })

  it('joins a row written inside its filter', async () => {
    const seen = await page(
      [['a1', 'active']],
      5,
      ["insert into items values ('a2', 'Item a2', 'active')"],
      logged,
    )
    expect([...seen.after].sort()).toEqual(['a1', 'a2'])
  })
})
