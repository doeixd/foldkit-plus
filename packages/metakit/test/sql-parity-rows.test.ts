/**
 * A question asked of the rows related to a row, four readers, the same
 * rows: `Expr.eval` over the related rows held under each row, the SQL text
 * on Postgres (PGlite) and on SQLite (`node:sqlite`), and the Drizzle
 * rendering on both. Lines are seeded with null in every column, negatives,
 * and owners that have none; every predicate also runs negated.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzleSqlite } from 'drizzle-orm/node-sqlite'
import { bigint, boolean, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core'
import { Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Arr, Bool, Eq, Expr, Null, Ord, Path } from 'metakit'
import { call } from 'metakit/build'
import * as Drizzle from 'metakit/drizzle'
import * as Relation from 'metakit/relation'
import * as Sql from 'metakit/sql'

const Owner = Schema.Struct({ id: Schema.String })
const Line = Schema.Struct({
  id: Schema.String,
  owner: Schema.String,
  amount: Schema.NullOr(Schema.Int),
  open: Schema.NullOr(Schema.Boolean),
})
type Line = typeof Line.Type

const Lines = Relation.make('Line.owner', Line)
type Env = { readonly row: typeof Owner.Type }
const { row } = Path.forEnv({ row: Owner })

/** mulberry32: the rows are the same on every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const owners = Array.from({ length: 40 }, (_, index) => `o${String(index).padStart(2, '0')}`)
const lines: ReadonlyArray<Line> = (() => {
  const random = seeded(603)
  const pick = <A>(pool: ReadonlyArray<A>): A => pool[Math.floor(random() * pool.length)]!
  // The last ten owners have no line.
  return Array.from({ length: 120 }, (_, index) => ({
    id: `l${String(index).padStart(3, '0')}`,
    owner: pick(owners.slice(0, 30)),
    amount: pick([null, 0, 3, -2, 7, 1, -9]),
    open: pick([null, true, false]),
  }))
})()

const envOf = (id: string) => ({
  row: { id, '<Line.owner': { rows: lines.filter(line => line.owner === id), whole: true } },
})

const predicates: Readonly<Record<string, Expr.Expr<Env, boolean | null>>> = {
  'any open': Relation.any(row, Lines, each => each.open),
  'any of a comparison': Relation.any(row, Lines, each => Ord.gt(each.amount, 2)),
  'every open': Relation.every(row, Lines, each => each.open),
  'every with an amount': Relation.every(row, Lines, each => Null.isNotNull(each.amount)),
  'count is 2': Eq.is(Relation.count(row, Lines), 2),
  'count is 0': Eq.is(Relation.count(row, Lines), 0),
  'count of the open is 1': Eq.is(
    Relation.count(row, Lines, each => each.open),
    1,
  ),
  'sum is positive': Ord.gt(
    Relation.sum(row, Lines, each => each.amount),
    0,
  ),
  'sum is 0': Eq.is(
    Relation.sum(row, Lines, each => each.amount),
    0,
  ),
  'sum of the open is at least 3': Ord.gte(
    Relation.sum(
      row,
      Lines,
      each => each.amount,
      each => each.open,
    ),
    3,
  ),
  'min is negative': Ord.lt(
    Relation.min(row, Lines, each => each.amount),
    0,
  ),
  'min is null': Null.isNull(Relation.min(row, Lines, each => each.amount)),
  'max of the open is 7': Eq.is(
    Relation.max(
      row,
      Lines,
      each => each.amount,
      each => each.open,
    ),
    7,
  ),
  'any and count': Bool.and(
    Relation.any(row, Lines, each => each.open),
    Ord.lte(Relation.count(row, Lines), 4),
  ),
}

const cases = Object.entries(predicates).flatMap(([name, predicate]) => [
  [name, predicate] as const,
  [`not (${name})`, Bool.not(predicate)] as const,
])

const held = (predicate: Expr.Expr<Env, boolean | null>): ReadonlyArray<string> =>
  owners.filter(id => Expr.eval(predicate, envOf(id)) === true)

const textOptions = (dialect: Sql.SqlDialect) => ({
  dialect,
  table: 'owners',
  relations: { 'Line.owner': { table: 'lines', foreignKey: 'owner' } },
})

const pgOwners = pgTable('owners', { id: pgText('id').primaryKey() })
const pgLines = pgTable('lines', {
  id: pgText('id').primaryKey(),
  owner: pgText('owner').notNull(),
  amount: bigint('amount', { mode: 'number' }),
  open: boolean('open'),
})
const sqliteOwners = sqliteTable('owners', { id: sqliteText('id').primaryKey() })
const sqliteLines = sqliteTable('lines', {
  id: sqliteText('id').primaryKey(),
  owner: sqliteText('owner').notNull(),
  amount: integer('amount'),
  open: integer('open'),
})

describe('Postgres answers as Expr.eval does over related rows', () => {
  let pg: PGlite
  beforeAll(async () => {
    pg = new PGlite()
    await pg.exec(`CREATE TABLE "owners" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "lines" ("id" TEXT PRIMARY KEY, "owner" TEXT NOT NULL, "amount" BIGINT, "open" BOOLEAN)`)
    for (const id of owners) await pg.query(`INSERT INTO "owners" VALUES ($1)`, [id])
    for (const line of lines) {
      await pg.query(`INSERT INTO "lines" VALUES ($1,$2,$3,$4)`, [
        line.id,
        line.owner,
        line.amount,
        line.open,
      ])
    }
  }, 60_000)
  afterAll(() => pg.close())

  it.each(cases)('%s, as text', async (_, predicate) => {
    const where = Result.getOrThrow(Sql.toWhere(predicate, textOptions('postgres')))
    const found = await pg.query<{ id: string }>(
      `SELECT "id" FROM "owners" WHERE ${where.text} ORDER BY "id"`,
      [...where.params],
    )
    expect(found.rows.map(each => each.id)).toEqual(held(predicate))
  })

  it.each(cases)('%s, through Drizzle', async (_, predicate) => {
    const where = Result.getOrThrow(
      Drizzle.toWhere(predicate, pgOwners, {
        relations: { 'Line.owner': { table: pgLines, foreignKey: 'owner' } },
      }),
    )
    const found = await drizzlePg({ client: pg })
      .select({ id: pgOwners.id })
      .from(pgOwners)
      .where(where)
      .orderBy(pgOwners.id)
    expect(found.map(each => each.id)).toEqual(held(predicate))
  })
})

describe('SQLite answers as Expr.eval does over related rows', () => {
  let db: DatabaseSync
  beforeAll(() => {
    db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE "owners" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "lines" ("id" TEXT PRIMARY KEY, "owner" TEXT NOT NULL, "amount" INTEGER, "open" INTEGER)`)
    const owner = db.prepare(`INSERT INTO "owners" VALUES (?)`)
    for (const id of owners) owner.run(id)
    const line = db.prepare(`INSERT INTO "lines" VALUES (?,?,?,?)`)
    for (const each of lines) {
      line.run(each.id, each.owner, each.amount, each.open === null ? null : each.open ? 1 : 0)
    }
  })
  afterAll(() => db.close())

  it.each(cases)('%s, as text', (_, predicate) => {
    const where = Result.getOrThrow(Sql.toWhere(predicate, textOptions('sqlite')))
    const found = db
      .prepare(`SELECT "id" FROM "owners" WHERE ${where.text} ORDER BY "id"`)
      .all(...(where.params as Array<SQLInputValue>))
    expect(found.map(each => each['id'])).toEqual(held(predicate))
  })

  it.each(cases)('%s, through Drizzle', async (_, predicate) => {
    const where = Result.getOrThrow(
      Drizzle.toWhere(predicate, sqliteOwners, {
        dialect: 'sqlite',
        relations: { 'Line.owner': { table: sqliteLines, foreignKey: 'owner' } },
      }),
    )
    const found = await drizzleSqlite({ client: db })
      .select({ id: sqliteOwners.id })
      .from(sqliteOwners)
      .where(where)
      .orderBy(sqliteOwners.id)
    expect(found.map(each => each.id)).toEqual(held(predicate))
  })
})

describe('what SQL refuses of rows, by name', () => {
  it('a relation no table is given for', () => {
    const refused = Sql.toWhere(Eq.is(Relation.count(row, Lines), 1), { table: 'owners' })
    expect(Result.isFailure(refused) && refused.failure.reason).toContain('Line.owner')
  })

  const Tagged = Schema.Struct({ tags: Schema.Array(Schema.String) })
  const { row: tagged } = Path.forEnv({ row: Tagged })
  it.each([
    ['rows.any over a list', Arr.any(tagged.tags, each => Eq.is(each, 'x'))],
    ['rows.keep over a list', Arr.isEmpty(Arr.keep(tagged.tags, each => Eq.is(each, 'x')))],
    [
      'arr.append',
      Arr.isEmpty(call<unknown, ReadonlyArray<string>>(Arr.appendOp, [tagged.tags, 'x'])),
    ],
    [
      'arr.include',
      Arr.isEmpty(call<unknown, ReadonlyArray<string>>(Arr.includeOp, [tagged.tags, 'x'])),
    ],
    [
      'arr.exclude',
      Arr.isEmpty(call<unknown, ReadonlyArray<string>>(Arr.excludeOp, [tagged.tags, 'x'])),
    ],
  ] as const)('%s, on both dialects', (name, predicate) => {
    for (const dialect of ['postgres', 'sqlite'] as const) {
      const refused = Sql.toWhere(predicate, { dialect })
      expect(Result.isFailure(refused) && refused.failure.reason).toContain(name)
    }
  })

  it('rows asked of a row without its table named', () => {
    const refused = Sql.toWhere(
      Relation.any(row, Lines, each => each.open),
      {
        relations: { 'Line.owner': { table: 'lines', foreignKey: 'owner' } },
      },
    )
    expect(Result.isFailure(refused) && refused.failure.reason).toContain('need the table')
  })
})

it('holds owners of every kind, so an agreement is not an agreement over nothing', () => {
  const counts = owners.map(id => lines.filter(line => line.owner === id).length)
  expect(counts.some(count => count === 0)).toBe(true)
  expect(counts.some(count => count >= 3)).toBe(true)
  const flat = Object.entries(predicates)
    .filter(([, predicate]) => {
      const count = held(predicate).length
      return count === 0 || count === owners.length
    })
    .map(([name]) => name)
  expect(flat).toEqual([])
})
