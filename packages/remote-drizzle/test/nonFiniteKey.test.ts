/**
 * A list ordered by a number that is not finite, paged one row at a time:
 * JSON writes `Infinity` and `NaN` as `null`, so a cursor that kept one that
 * way paged on as if the row it ended on held no value, and skipped the rows
 * tied with it.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { doublePrecision, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Expr, Operators, Order, Query as Relational } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DrizzleOperators, databaseLayer, entity, query } from '../src/index.js'

const Score = Entity.define('Score', Schema.Struct({ id: Schema.String, score: Schema.Number }))
const twice = Expr.operator('acme.twice', { input: [Schema.Number], output: Schema.Number })
const operators = {
  memory: Operators.merge(
    Operators.kernel,
    Operators.memory(Operators.implement(twice, score => score * 2)),
  ),
  sql: DrizzleOperators.merge(
    DrizzleOperators.kernel,
    DrizzleOperators.make(
      DrizzleOperators.implement(twice, ({ args: [score] }) => sql`${score} * 2`),
    ),
  ),
}
const descriptor = (direction: 'asc' | 'desc') => ({
  ...Query.make('Ranked', { Input: {}, Result: Query.connection(Score) }),
  body: Relational.from(Score).pipe(
    Relational.orderBy(
      direction === 'asc'
        ? Order.asc(twice(Score.fields.score))
        : Order.desc(twice(Score.fields.score)),
    ),
  ),
})

const create = (type: string) => `create table scores (id text primary key, score ${type} not null)`
const sqliteScores = sqliteTable('scores', {
  id: text('id').primaryKey(),
  score: real('score').notNull(),
})
const pgScores = pgTable('scores', {
  id: pgText('id').primaryKey(),
  score: doublePrecision('score').notNull(),
})
const sqlite = new DatabaseSync(':memory:')
sqlite.exec(create('real'))
const pglite = new PGlite()
beforeAll(async () => {
  await pglite.exec(create('double precision'))
}, 60_000)
afterAll(async () => {
  sqlite.close()
  await pglite.close()
})

const backends = {
  SQLite: {
    fill: async (rows: ReadonlyArray<readonly [string, number]>) => {
      sqlite.exec('delete from scores')
      for (const [id, score] of rows)
        sqlite.prepare('insert into scores values (?, ?)').run(id, score)
    },
    target: () => entity('Score', sqliteScores, { operators }),
    layer: () => databaseLayer(drizzle({ client: sqlite })),
  },
  Postgres: {
    fill: async (rows: ReadonlyArray<readonly [string, number]>) => {
      await pglite.exec('delete from scores')
      for (const [id, score] of rows) {
        await pglite.query('insert into scores values ($1, $2)', [id, String(score)])
      }
    },
    target: () => entity('Score', pgScores, { operators }),
    layer: () => databaseLayer(drizzlePg({ client: pglite })),
  },
}
type Backend = (typeof backends)[keyof typeof backends]

/** Every id the query lists, one row a page, each page after the last one's cursor. */
const paged = async (backend: Backend, direction: 'asc' | 'desc') => {
  const run = query(descriptor(direction), { entity: backend.target() })
  const ids: Array<string> = []
  let after: string | undefined
  for (let page = 0; page < 10; page++) {
    const answer = await Effect.runPromise(
      run
        .run({
          input: {},
          window: after === undefined ? { first: 1 } : { first: 1, after },
          principal: null,
        })
        .pipe(Effect.provide(backend.layer())),
    )
    ids.push(...answer.edges.map(edge => edge.id))
    if (answer.end._tag !== 'Cursor') return ids
    after = answer.end.cursor
  }
  throw new Error('the pages never ended')
}

describe.each(Object.entries(backends))(
  'Paging by a number past one not finite on %s',
  (_, backend) => {
    it('lists every row tied at Infinity, either way', async () => {
      await backend.fill([
        ['s1', 1],
        ['s2', Infinity],
        ['s3', Infinity],
        ['s4', 3],
      ])
      expect(await paged(backend, 'asc')).toEqual(['s1', 's4', 's2', 's3'])
      expect(await paged(backend, 'desc')).toEqual(['s2', 's3', 's4', 's1'])
    })

    it('lists every row tied at -Infinity', async () => {
      await backend.fill([
        ['s1', 1],
        ['s2', -Infinity],
        ['s3', -Infinity],
        ['s4', 3],
      ])
      expect(await paged(backend, 'asc')).toEqual(['s2', 's3', 's1', 's4'])
    })
  },
)

describe('Paging by a number past NaN on Postgres, which orders it above every other', () => {
  it('lists every row tied at NaN', async () => {
    await backends.Postgres.fill([
      ['s1', 1],
      ['s2', NaN],
      ['s3', NaN],
      ['s4', Infinity],
    ])
    expect(await paged(backends.Postgres, 'asc')).toEqual(['s1', 's4', 's2', 's3'])
  })
})
