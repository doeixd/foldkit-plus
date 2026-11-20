/**
 * One predicate, four readers, the same rows: `Expr.eval` in memory, the SQL
 * text on Postgres (PGlite) and on SQLite (`node:sqlite`), and the Drizzle
 * rendering on both. Rows are seeded and hold null in every column, negatives,
 * astral characters, the `LIKE` wildcards, a quote and a backslash; every
 * predicate also runs negated, where a null operand shows.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzleSqlite } from 'drizzle-orm/node-sqlite'
import { bigint, boolean, doublePrecision, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer, real, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core'
import { Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Arr, Bool, Eq, Expr, Null, Num, Ord, Path, Str } from 'metakit'
import * as Drizzle from 'metakit/drizzle'
import * as Sql from 'metakit/sql'

const Row = Schema.Struct({
  id: Schema.String,
  n: Schema.NullOr(Schema.Int),
  m: Schema.NullOr(Schema.Int),
  x: Schema.NullOr(Schema.Finite),
  s: Schema.NullOr(Schema.String),
  t: Schema.NullOr(Schema.String),
  b: Schema.NullOr(Schema.Boolean),
  c: Schema.NullOr(Schema.Boolean),
  tags: Schema.NullOr(Schema.Array(Schema.String)),
  st: Schema.NullOr(Schema.Literals(['a', 'b'])),
})
type Row = typeof Row.Type

/** mulberry32: the rows are the same on every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const ints = [null, 0, -7, 3, 5, 1, -1, 1_000_000, -1_000_000] as const
const floats = [null, 0, 0.5, -2.25, 3] as const
const texts = [null, '', 'a%b_c\\d', '😀x', "O'Brien", 'axb', 'a%', '_', 'x', '😀', 'a'] as const
const flags = [null, true, false] as const
const lists = [null, [], ['x'], ['x', 'y']] as const
const states = [null, 'a', 'b'] as const

const rows: ReadonlyArray<Row> = (() => {
  const random = seeded(601)
  const pick = <A>(pool: ReadonlyArray<A>): A => pool[Math.floor(random() * pool.length)]!
  const drawn = Array.from({ length: 160 }, (_, index) => ({
    id: `r${String(index).padStart(3, '0')}`,
    n: pick(ints),
    m: pick(ints),
    x: pick(floats),
    s: pick(texts),
    t: pick(texts),
    b: pick(flags),
    c: pick(flags),
    tags: pick(lists),
    st: pick(states),
  }))
  const nothing: Row = {
    id: 'null',
    n: null,
    m: null,
    x: null,
    s: null,
    t: null,
    b: null,
    c: null,
    tags: null,
    st: null,
  }
  return [nothing, ...drawn]
})()

type Env = { readonly row: Row }

// The operators take operands that are never null by type. A column is null all
// the same (a nullable column read through a looser path, a parent that is
// absent), and that is the case under test: these paths claim the value's type.
const column = <A>(key: keyof Row & string) => Path.make<Env, A>(['row', key])
const strict = {
  n: column<number>('n'),
  m: column<number>('m'),
  x: column<number>('x'),
  s: column<string>('s'),
  t: column<string>('t'),
  b: column<boolean>('b'),
  c: column<boolean>('c'),
  tags: column<ReadonlyArray<string>>('tags'),
  st: column<'a' | 'b'>('st'),
}
/** The same columns as the Schema types them, for the operators that take a null. */
const nullable = Path.forEnv({ row: Row }).row

const over = (
  build: (row: typeof strict, maybe: typeof nullable) => Expr.Expr<Env, boolean>,
): Expr.Expr<Env, boolean> => build(strict, nullable)

/** Every operation, with a column in each operand position so each meets null. */
const predicates: Readonly<Record<string, Expr.Expr<Env, boolean>>> = {
  'bool.and': over(row => Bool.and(row.b, row.c)),
  'bool.or': over(row => Bool.or(row.b, row.c)),
  'bool.not': over(row => Bool.not(row.b)),
  'bool.and of comparisons': over(row => Bool.and(Ord.gt(row.n, 0), Ord.gt(row.m, 0))),
  'bool.or of comparisons': over(row => Bool.or(Ord.gt(row.n, 0), Ord.gt(row.m, 0))),
  implies: over(row => Expr.implies(Ord.gt(row.n, 0), Ord.gt(row.m, 0))),
  'a boolean column': over(row => row.b),

  'eq.is columns': over(row => Eq.is(row.n, row.m)),
  'eq.is a number': over(row => Eq.is(row.n, 3)),
  'eq.is null': over((_, maybe) => Eq.is(maybe.n, null)),
  'eq.is text with a quote': over(row => Eq.is(row.s, "O'Brien")),
  'eq.is text columns': over(row => Eq.is(row.s, row.t)),
  'eq.is a boolean': over(row => Eq.is(row.b, true)),
  'eq.is booleans': over(row => Eq.is(row.b, row.c)),
  'eq.is an enum': over(row => Eq.is(row.st, 'a')),
  'eq.isNot columns': over(row => Eq.isNot(row.n, row.m)),
  'eq.isNot a number': over(row => Eq.isNot(row.n, 3)),
  'eq.isNot null': over((_, maybe) => Eq.isNot(maybe.s, null)),

  'eq.in numbers': over(row => Eq.oneOf(row.n, [0, 3, -7])),
  'eq.in nothing': over(row => Eq.oneOf(row.n, [])),
  'eq.in with null': over((_, maybe) => Eq.oneOf(maybe.n, [null, 3])),
  'eq.in only null': over((_, maybe) => Eq.oneOf(maybe.n, [null])),
  'eq.in text with wildcards': over(row => Eq.oneOf(row.s, ['a%', '_', "O'Brien", ''])),
  'eq.in of a sum': over(row => Eq.oneOf(Num.add(row.m, 1), [1, 4])),
  'eq.in of a choice, with null': over(row =>
    Eq.oneOf(Expr.when(Eq.is(row.m, 5), { then: null, else: row.m }), [null, 3]),
  ),

  'null.isNull number': over(row => Null.isNull(row.n)),
  'null.isNull text': over(row => Null.isNull(row.s)),
  'null.isNull array': over(row => Null.isNull(row.tags)),
  'null.isNull of a sum': over(row => Null.isNull(Num.add(row.n, row.m))),
  'null.isNotNull': over(row => Null.isNotNull(row.b)),

  'ord.lt columns': over(row => Ord.lt(row.n, row.m)),
  'ord.lte columns': over(row => Ord.lte(row.n, row.m)),
  'ord.gt columns': over(row => Ord.gt(row.n, row.m)),
  'ord.gte columns': over(row => Ord.gte(row.n, row.m)),
  'ord.lt a number': over(row => Ord.lt(row.n, 5)),
  'ord.gte from the left': over(row => Ord.gte(0, row.n)),
  'ord.between': over(row => Ord.between(row.n, -1, 3)),
  'ord over fractions': over(row => Ord.gt(Num.add(row.x, 0.5), 1)),

  'num.add': over(row => Eq.is(Num.add(row.n, row.m), 0)),
  'num.sub': over(row => Ord.gt(Num.sub(row.n, row.m), 2)),
  'num.mul': over(row => Ord.lt(Num.mul(row.n, row.m), 0)),
  'num.mul by zero': over(row => Eq.is(Num.mul(row.n, row.m), 0)),
  'num.neg': over(row => Ord.gt(Num.neg(row.n), 0)),
  'num.min': over(row => Ord.lte(Num.min(row.n, row.m), 0)),
  'num.max': over(row => Ord.gte(Num.max(row.n, row.m), 3)),
  'num.abs': over(row => Ord.lte(Num.abs(row.n), 3)),
  'num.clamp': over(row => Eq.is(Num.clamp(row.n, -1, 3), row.n)),

  'str.len': over(row => Eq.is(Str.len(row.s), 2)),
  'str.len of an astral character': over(row => Eq.is(Str.len(row.s), 1)),
  'str.len columns': over(row => Ord.gt(Str.len(row.s), Str.len(row.t))),
  'str.isEmpty': over(row => Str.isEmpty(row.s)),
  'str.startsWith a wildcard': over(row => Str.startsWith(row.s, 'a%')),
  'str.startsWith an underscore': over(row => Str.startsWith(row.s, '_')),
  'str.startsWith an astral character': over(row => Str.startsWith(row.s, '😀')),
  'str.startsWith the empty text': over(row => Str.startsWith(row.s, '')),
  'str.startsWith a column': over(row => Str.startsWith(row.s, row.t)),
  'str.contains an underscore': over(row => Str.contains(row.s, '_')),
  'str.contains a percent': over(row => Str.contains(row.s, '%')),
  'str.contains a backslash': over(row => Str.contains(row.s, '\\')),
  'str.contains a quote': over(row => Str.contains(row.s, "'")),
  'str.contains the empty text': over(row => Str.contains(row.s, '')),
  'str.contains a column': over(row => Str.contains(row.s, row.t)),

  'arr.count': over(row => Eq.is(Arr.count(row.tags), 2)),
  'arr.count compared': over(row => Ord.lt(Arr.count(row.tags), 2)),
  'arr.isEmpty': over(row => Arr.isEmpty(row.tags)),
  'arr.nonEmpty': over(row => Arr.nonEmpty(row.tags)),

  if: over(row => Ord.gt(Expr.when(row.b, { then: row.n, else: row.m }), 0)),
  'if, to a boolean': over(row => Expr.when(Ord.gt(row.n, 0), { then: row.b, else: row.c })),
  'match with a fallback': over((_, maybe) => Eq.is(Expr.matchOrElse(maybe.st, { a: 1 }, 0), 0)),
  'match to text': over((_, maybe) =>
    Eq.is(Expr.matchOrElse(maybe.st, { a: 'x', b: "y'" }, 'z'), "y'"),
  ),
  'match to a column': over((row, maybe) =>
    Ord.gt(Expr.matchOrElse(maybe.st, { a: row.n }, row.m), 0),
  ),
}

const cases = Object.entries(predicates).flatMap(([name, predicate]) => [
  [name, predicate] as const,
  [`not (${name})`, Bool.not(predicate)] as const,
])

const held = (predicate: Expr.Expr<Env, boolean>): ReadonlyArray<string> =>
  rows.filter(row => Expr.eval(predicate, { row }) === true).map(row => row.id)

const pgRows = pgTable('rows', {
  id: pgText('id').primaryKey(),
  n: bigint('n', { mode: 'number' }),
  m: bigint('m', { mode: 'number' }),
  x: doublePrecision('x'),
  s: pgText('s'),
  t: pgText('t'),
  b: boolean('b'),
  c: boolean('c'),
  tags: pgText('tags').array(),
  st: pgText('st'),
})

const sqliteRows = sqliteTable('rows', {
  id: sqliteText('id').primaryKey(),
  n: integer('n'),
  m: integer('m'),
  x: real('x'),
  s: sqliteText('s'),
  t: sqliteText('t'),
  b: integer('b'),
  c: integer('c'),
  tags: sqliteText('tags'),
  st: sqliteText('st'),
})

describe('Postgres answers as Expr.eval does', () => {
  let pg: PGlite
  beforeAll(async () => {
    pg = new PGlite()
    await pg.exec(
      `CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "n" BIGINT, "m" BIGINT, "x" DOUBLE PRECISION,
        "s" TEXT, "t" TEXT, "b" BOOLEAN, "c" BOOLEAN, "tags" TEXT[], "st" TEXT)`,
    )
    for (const row of rows) {
      await pg.query(`INSERT INTO "rows" VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
        row.id,
        row.n,
        row.m,
        row.x,
        row.s,
        row.t,
        row.b,
        row.c,
        row.tags,
        row.st,
      ])
    }
  }, 60_000)
  afterAll(() => pg.close())

  it.each(cases)('%s, as text', async (_, predicate) => {
    const where = Result.getOrThrow(Sql.toWhere(predicate))
    const found = await pg.query<{ id: string }>(
      `SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`,
      [...where.params],
    )
    expect(found.rows.map(row => row.id)).toEqual(held(predicate))
  })

  it.each(cases)('%s, through Drizzle', async (_, predicate) => {
    const where = Result.getOrThrow(Drizzle.toWhere(predicate, pgRows))
    const found = await drizzlePg({ client: pg })
      .select({ id: pgRows.id })
      .from(pgRows)
      .where(where)
      .orderBy(pgRows.id)
    expect(found.map(row => row.id)).toEqual(held(predicate))
  })
})

describe('SQLite answers as Expr.eval does', () => {
  let db: DatabaseSync
  beforeAll(() => {
    db = new DatabaseSync(':memory:')
    db.exec(
      `CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "n" INTEGER, "m" INTEGER, "x" REAL,
        "s" TEXT, "t" TEXT, "b" INTEGER, "c" INTEGER, "tags" TEXT, "st" TEXT)`,
    )
    const insert = db.prepare(`INSERT INTO "rows" VALUES (?,?,?,?,?,?,?,?,?,?)`)
    const flag = (value: boolean | null) => (value === null ? null : value ? 1 : 0)
    for (const row of rows) {
      insert.run(
        row.id,
        row.n,
        row.m,
        row.x,
        row.s,
        row.t,
        flag(row.b),
        flag(row.c),
        row.tags === null ? null : JSON.stringify(row.tags),
        row.st,
      )
    }
  })
  afterAll(() => db.close())

  it.each(cases)('%s, as text', (_, predicate) => {
    const where = Result.getOrThrow(Sql.toWhere(predicate, { dialect: 'sqlite' }))
    const found = db
      .prepare(`SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`)
      .all(...(where.params as Array<SQLInputValue>))
    expect(found.map(row => row['id'])).toEqual(held(predicate))
  })

  it.each(cases)('%s, through Drizzle', async (_, predicate) => {
    const where = Result.getOrThrow(Drizzle.toWhere(predicate, sqliteRows, { dialect: 'sqlite' }))
    const found = await drizzleSqlite({ client: db })
      .select({ id: sqliteRows.id })
      .from(sqliteRows)
      .where(where)
      .orderBy(sqliteRows.id)
    expect(found.map(row => row.id)).toEqual(held(predicate))
  })
})

it('holds rows of every kind, so an agreement is not an agreement over nothing', () => {
  const some = (test: (row: Row) => boolean) => rows.some(test)
  expect(some(row => row.n === null && row.m !== null)).toBe(true)
  expect(some(row => row.n !== null && row.m === null)).toBe(true)
  expect(some(row => row.n !== null && row.n < 0)).toBe(true)
  expect(some(row => row.s === '😀x')).toBe(true)
  expect(some(row => row.s === 'a%b_c\\d')).toBe(true)
  expect(some(row => row.tags !== null && row.tags.length === 0)).toBe(true)
  // Each predicate separates the rows, or the comparison could not fail.
  const flat = Object.entries(predicates)
    .filter(([, predicate]) => {
      const count = held(predicate).length
      return count === 0 || count === rows.length
    })
    .map(([name]) => name)
  expect(flat).toEqual(['eq.in nothing'])
})
