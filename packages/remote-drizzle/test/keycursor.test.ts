// @vitest-environment node
/**
 * A page's cursor is where the page ended, as the order's key values there,
 * not a row to look up: "load more" still works after the last row read is
 * deleted, stops matching, or moves.
 */
import { Effect, Option, Schema } from 'effect'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { DatabaseSync } from 'node:sqlite'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { CursorRead, keyCursor, readCursor } from '../src/cursor.js'
import { databaseLayer, entity, query } from '../src/index.js'

const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  rank: integer('rank').notNull(),
})
const Item = DomainEntity.define(
  'Item',
  Schema.Struct({ id: Schema.String, status: Schema.String, rank: Schema.Number }),
)
const Active = Query.define('Active', {}, () =>
  Query.from(Item).pipe(
    Query.where(Expr.eq(Item.fields.status, 'active')),
    Query.orderBy(Order.asc(Item.fields.rank)),
  ),
)
const source = query(Active, { entity: entity('Item', items) })

const seeded = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    'create table items (id text primary key, status text not null, rank integer not null)',
  )
  const insert = sqlite.prepare('insert into items values (?, ?, ?)')
  for (const [id, rank] of [
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
    ['e', 5],
  ] as const)
    insert.run(id, 'active', rank)
  return sqlite
}

const page = (sqlite: DatabaseSync, after?: string) =>
  Effect.runPromise(
    source
      .run({
        input: {},
        window: { first: 2, ...(after === undefined ? {} : { after }) },
        principal: null,
      })
      .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  )

/** The second page, after `change` is done to the database once the first is read. */
const secondAfter = async (change: (sqlite: DatabaseSync) => void) => {
  const sqlite = seeded()
  try {
    const first = await page(sqlite)
    expect(first.edges.map(edge => edge.id)).toEqual(['a', 'b'])
    if (first.end._tag !== 'Cursor') throw new Error('the first page has more after it')
    change(sqlite)
    return (await page(sqlite, first.end.cursor)).edges.map(edge => edge.id)
  } finally {
    sqlite.close()
  }
}

describe('a cursor is where its page ended, whatever its row did since', () => {
  it('continues after the last row read was deleted', async () => {
    expect(await secondAfter(sqlite => sqlite.exec("delete from items where id = 'b'"))).toEqual([
      'c',
      'd',
    ])
  })

  it('continues after the last row read stopped matching', async () => {
    expect(
      await secondAfter(sqlite => sqlite.exec("update items set status = 'gone' where id = 'b'")),
    ).toEqual(['c', 'd'])
  })

  it('continues from where the page ended, not from where the row moved', async () => {
    // `b` moved past the end; the next page starts after rank 2, as read.
    expect(
      await secondAfter(sqlite => sqlite.exec("update items set rank = 9 where id = 'b'")),
    ).toEqual(['c', 'd'])
  })
})

describe('a cursor is client input, read as one', () => {
  it('carries a date and a bigint back as themselves', () => {
    const at = new Date('2026-01-02T03:04:05.000Z')
    const cursor = Option.getOrThrow(keyCursor([at, 12n, 'a', null]))
    expect(readCursor(cursor, 4)).toEqual(CursorRead.Keys({ values: [at, 12n, 'a', null] }))
  })

  it('is refused when it is not JSON, holds other than key values, or counts other terms', () => {
    expect(readCursor('k:{nope', 2)._tag).toBe('Invalid')
    expect(readCursor('k:[1]', 2)._tag).toBe('Invalid')
    expect(readCursor('k:[{"constructor":1},"a"]', 2)._tag).toBe('Invalid')
    expect(readCursor('k:[{"$date":"not a date"},"a"]', 2)._tag).toBe('Invalid')
    expect(readCursor('k:[{"$bigint":"1e3"},"a"]', 2)._tag).toBe('Invalid')
  })

  it('reads one from before keys as an id', () => {
    expect(readCursor('p2', 2)).toEqual(CursorRead.Id({ id: 'p2' }))
  })

  it('fails a page asked for after a forged cursor, as the request’s mistake', async () => {
    const sqlite = seeded()
    try {
      await expect(page(sqlite, 'k:["x"]')).rejects.toThrow(/not one this server minted/)
    } finally {
      sqlite.close()
    }
  })

  it('still pages after a cursor from before keys, by its row', async () => {
    const sqlite = seeded()
    try {
      expect((await page(sqlite, 'b')).edges.map(edge => edge.id)).toEqual(['c', 'd'])
    } finally {
      sqlite.close()
    }
  })
})
