// @vitest-environment node
/**
 * A cursor from before keyed cursors is a bare id, and an id may begin `k:`
 * as a keyed cursor does (#322): a row holding the whole cursor as its id is
 * the row it names, whether the rest reads as key values or as nothing, on
 * SQLite and Postgres. An id cursor minted now says it is one.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { pgTable, integer as pgInteger, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CursorRead, idCursor, readCursor } from '../src/cursor.js'
import { databaseLayer, entity, query } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, rank: Schema.Number }))
const ByRank = Query.define('ByRank', {}, () =>
  Query.from(Item).pipe(Query.orderBy(Order.asc(Item.fields.rank))),
)
const sqliteItems = sqliteTable('items', {
  id: text('id').primaryKey(),
  rank: integer('rank').notNull(),
})
const pgItems = pgTable('items', {
  id: pgText('id').primaryKey(),
  rank: pgInteger('rank').notNull(),
})

// Ids an older server handed out as cursors: one reads as no keys at all, one
// as the key values of a place past every row.
const rows = [
  ['a', 1],
  ['k:customer', 2],
  ['k:[9,"z"]', 3],
  ['d', 4],
  ['e', 5],
] as const

const dialects = [
  {
    name: 'SQLite',
    open: async () => {
      const client = new DatabaseSync(':memory:')
      client.exec('create table items (id text primary key, rank integer not null)')
      for (const row of rows) client.prepare('insert into items values (?, ?)').run(...row)
      return {
        source: query(ByRank, { entity: entity('Item', sqliteItems) }),
        layer: databaseLayer(drizzle({ client })),
        close: async () => client.close(),
      }
    },
  },
  {
    name: 'Postgres',
    open: async () => {
      const client = new PGlite()
      await client.exec('create table items (id text primary key, rank integer not null)')
      for (const row of rows) await client.query('insert into items values ($1, $2)', [...row])
      return {
        source: query(ByRank, { entity: entity('Item', pgItems) }),
        layer: databaseLayer(drizzlePg({ client })),
        close: () => client.close(),
      }
    },
  },
]

describe.each(dialects)('a cursor from before keys, on $name', ({ open }) => {
  let database: Awaited<ReturnType<(typeof dialects)[number]['open']>>
  beforeAll(async () => {
    database = await open()
  }, 60_000)
  afterAll(() => database.close())

  const after = (cursor: string) =>
    Effect.runPromise(
      database.source.run({ input: {}, window: { first: 2, after: cursor }, principal: null }).pipe(
        Effect.map(page => page.edges.map(edge => edge.id)),
        Effect.provide(database.layer),
      ),
    )

  it.each([
    ['k:customer', ['k:[9,"z"]', 'd']],
    ['k:[9,"z"]', ['d', 'e']],
    ['a', ['k:customer', 'k:[9,"z"]']],
  ])('pages after %s by its row', async (cursor, expected) => {
    expect(await after(cursor)).toEqual(expected)
  })

  it('pages after an id cursor by its row, and refuses one whose row is gone', async () => {
    expect(await after(idCursor('k:customer'))).toEqual(['k:[9,"z"]', 'd'])
    await expect(after(idCursor('gone'))).rejects.toThrow('no longer resolves')
  })
})

describe('an id cursor', () => {
  it('reads back as the id it names, whatever the id holds', () => {
    for (const id of ['k:[1,"a"]', 'b', '{"id":1}'])
      expect(readCursor(idCursor(id), 2)).toEqual(CursorRead.Id({ id }))
  })
})
