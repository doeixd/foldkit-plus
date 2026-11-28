/**
 * What the one SQL lowering refuses and how it binds, executed on PGlite and
 * `node:sqlite` where the claim is about a database's answer.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Bool, Eq, Expr, Num, Ord, Path, Str, Transition } from '@doeixd/metakit'
import * as Drizzle from '@doeixd/metakit/drizzle'
import * as Sql from '@doeixd/metakit/sql'

const Account = Schema.Struct({ id: Schema.String, balance: Schema.Int })
const Withdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Schema.Int.pipe(Expr.refine($ => Num.gt($, 0))) }),
  when: ({ state, input }) => Ord.lte(input.amount, state.balance),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})

const reasonOf = (result: Result.Result<unknown, { readonly reason: string }>): string =>
  Result.isFailure(result) ? result.failure.reason : 'lowered'

const sqliteRows = (db: DatabaseSync, fragment: Sql.SqlFragment, select: string) =>
  db.prepare(`${select} WHERE ${fragment.text}`).all(...(fragment.params as Array<SQLInputValue>))

let pg: PGlite
beforeAll(() => {
  pg = new PGlite()
})
afterAll(() => pg.close())

describe('a guarded UPDATE', () => {
  it('binds the key and the guard to their own placeholders on SQLite', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE "acc" ("id" TEXT PRIMARY KEY, "balance" INTEGER)`)
    // A row whose id is the amount: a parameter list out of order updates this one.
    db.exec(`INSERT INTO "acc" VALUES ('u1', 100), ('30', 100)`)
    const update = Result.getOrThrow(
      Sql.toUpdate(
        'acc',
        Withdraw,
        { amount: 30 },
        { dialect: 'sqlite', whereId: { column: 'id', value: 'u1' } },
      ),
    )
    expect(update.text).toBe(
      'UPDATE "acc" SET "balance" = NULLIF(NULLIF(max(min(("balance" - ?), 9007199254740992), -9007199254740992), 9007199254740992), -9007199254740992) WHERE "id" = ? AND (? <= "balance")',
    )
    expect(update.params).toEqual([30, 'u1', 30])
    db.prepare(update.text).run(...(update.params as Array<SQLInputValue>))
    expect(db.prepare(`SELECT * FROM "acc" ORDER BY "id"`).all()).toEqual([
      { id: '30', balance: 100 },
      { id: 'u1', balance: 70 },
    ])
  })

  it('refuses an input the transition’s input Schema refuses', () => {
    const table = pgTable('acc', { id: text('id'), balance: integer('balance') })
    const written = Sql.toUpdate('acc', Withdraw, { amount: -30 })
    const drizzled = Drizzle.toUpdate(Withdraw, { amount: -30 }, table)
    expect(Result.isFailure(written) && written.failure._tag).toBe('Refused')
    expect(Result.isFailure(drizzled) && drizzled.failure._tag).toBe('Refused')
    expect(Result.isSuccess(Sql.toUpdate('acc', Withdraw, { amount: 30 }))).toBe(true)
  })

  it('names the key by a field of the state', () => {
    // @ts-expect-error `owner` is no field of the account
    Sql.toUpdate('acc', Withdraw, { amount: 1 }, { whereId: { column: 'owner', value: 'u1' } })
    // @ts-expect-error the id is text
    Sql.toUpdate('acc', Withdraw, { amount: 1 }, { whereId: { column: 'id', value: 7 } })
  })
})

describe('membership', () => {
  const Row = Schema.Struct({ id: Schema.String, m: Schema.NullOr(Schema.Int) })
  const nextIsNullOrThree = Expr.in({ row: Row }, ({ row }) =>
    // The needle holds a constant of its own, written once for `IN` and once for `IS NULL`.
    Eq.oneOf(Expr.when(Eq.is(row.m, 9), { then: null, else: row.m }), [null, 3]),
  )

  it('binds a needle written twice twice, so SQLite counts as many values as placeholders', () => {
    const where = Result.getOrThrow(Sql.toWhere(nextIsNullOrThree, { dialect: 'sqlite' }))
    expect(where.text.split('?').length - 1).toBe(where.params.length)
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE "t" ("id" TEXT, "m" INTEGER)`)
    db.exec(`INSERT INTO "t" VALUES ('a', 3), ('b', 9), ('c', 4), ('d', NULL)`)
    expect(sqliteRows(db, where, `SELECT "id" FROM "t"`)).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'd' },
    ])
  })

  it('writes an empty list as FALSE and an all-null list as IS NULL', () => {
    const none = Expr.in({ row: Row }, ({ row }) => Eq.oneOf(row.m, []))
    const onlyNull = Expr.in({ row: Row }, ({ row }) => Eq.oneOf(row.m, [null]))
    expect(Result.getOrThrow(Sql.toWhere(none))).toEqual({ text: 'FALSE', params: [] })
    expect(Result.getOrThrow(Sql.toWhere(onlyNull))).toEqual({
      text: '("m" IS NULL)',
      params: [],
    })
  })
})

describe('what the lowering refuses', () => {
  const Row = Schema.Struct({
    n: Schema.Int,
    x: Schema.Finite,
    s: Schema.String,
    a_b: Schema.Int,
    a: Schema.Struct({ b: Schema.Int }),
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('refuses %s as a parameter and as an inlined literal', (name, value) => {
    const where = Sql.toWhere(Expr.in({ row: Row }, ({ row }) => Ord.lt(row.x, value)))
    expect(reasonOf(where)).toBe(`non-finite number literal: ${name}`)
    const checked = Row.pipe(Expr.refine($ => Ord.lt($.x, value)))
    expect(reasonOf(Sql.toCheck(checked))).toBe(`non-finite number literal: ${name}`)
  })

  it('refuses a NUL in text, which Postgres cannot hold', () => {
    const where = Sql.toWhere(Expr.in({ row: Row }, ({ row }) => Eq.is(row.s, 'a\u0000b')))
    expect(reasonOf(where)).toBe('text literal holds a NUL character')
  })

  it('refuses two paths that come to one column name', () => {
    const where = Sql.toWhere(Expr.in({ row: Row }, ({ row }) => Ord.lt(row.a_b, row.a.b)))
    expect(reasonOf(where)).toBe('paths "a_b" and "a.b" both name the column "a_b"')
    const table = pgTable('t', { a_b: integer('a_b') })
    const drizzled = Drizzle.toWhere(
      Expr.in({ row: Row }, ({ row }) => Ord.lt(row.a_b, row.a.b)),
      table,
    )
    expect(reasonOf(drizzled)).toBe('paths "a_b" and "a.b" both name the column a_b')
  })

  it.each([
    ['added', Expr.in({ row: Row }, ({ row }) => Ord.gt(Num.add(row.n, 0.5), 1))],
    ['compared', Expr.in({ row: Row }, ({ row }) => Ord.gt(row.n, 0.5))],
    ['compared from the left', Expr.in({ row: Row }, ({ row }) => Ord.gt(0.5, row.n))],
    ['equated', Expr.in({ row: Row }, ({ row }) => Eq.is(Num.mul(row.n, 2), 0.5))],
    ['among candidates', Expr.in({ row: Row }, ({ row }) => Eq.oneOf(row.n, [1, 0.5]))],
    ['beside a length', Expr.in({ row: Row }, ({ row }) => Ord.gt(Str.len(row.s), 0.5))],
  ])('refuses a fraction %s to an integer term', (_, predicate) => {
    expect(reasonOf(Sql.toWhere(predicate))).toMatch(/^a fraction beside an integer column/)
  })

  it('lowers a fraction beside a column that is not an integer, and Postgres runs it', async () => {
    const where = Result.getOrThrow(
      Sql.toWhere(Expr.in({ row: Row }, ({ row }) => Ord.gt(Num.add(row.x, 0.5), 1))),
    )
    await pg.exec(
      `CREATE TABLE "fx" ("x" DOUBLE PRECISION); INSERT INTO "fx" VALUES (0.25), (0.75)`,
    )
    const rows = await pg.query(`SELECT "x" FROM "fx" WHERE ${where.text}`, [...where.params])
    expect(rows.rows).toEqual([{ x: 0.75 }])
  })

  it('names the column a Drizzle table lacks', () => {
    const table = pgTable('acc', { id: text('id') })
    expect(reasonOf(Drizzle.toUpdate(Withdraw, { amount: 10 }, table))).toBe(
      'table has no column "balance"',
    )
  })
})

describe('how values are written', () => {
  it('doubles a quote in an identifier, and Postgres reads the column', async () => {
    const Odd = Schema.Struct({ 'we"ird': Schema.Int }).pipe(
      Expr.refine($ => Ord.gte($['we"ird'], 0)),
    )
    const check = Result.getOrThrow(Sql.toCheck(Odd))
    expect(check).toBe('CHECK ((("we""ird" >= 0)) IS TRUE)')
    await pg.exec(`CREATE TABLE "odd" ("we""ird" INTEGER, ${check})`)
    await pg.exec(`INSERT INTO "odd" VALUES (1)`)
    await expect(pg.exec(`INSERT INTO "odd" VALUES (-1)`)).rejects.toThrow(/check constraint/)
  })

  it('doubles a quote in an inlined text literal, in text and through Drizzle', async () => {
    const Named = Schema.Struct({ name: Schema.String }).pipe(
      Expr.refine($ => Eq.isNot($.name, "x' OR 1=1 --")),
    )
    const table = pgTable('named', { name: text('name') })
    const drizzled = Result.getOrThrow(Drizzle.toCheck(Named, table))
    const rendered = drizzled.toQuery({
      escapeName: name => `"${name}"`,
      escapeParam: index => `$${index + 1}`,
      escapeString: value => `'${value}'`,
    })
    expect(rendered.params).toEqual([])
    await pg.exec(
      `CREATE TABLE "named" ("name" TEXT, ${Result.getOrThrow(Sql.toCheck(Named))});
       CREATE TABLE "named2" ("name" TEXT, CHECK (${rendered.sql.replaceAll('"named".', '')}))`,
    )
    for (const tableName of ['named', 'named2']) {
      await pg.query(`INSERT INTO "${tableName}" VALUES ($1)`, ['fine'])
      await expect(
        pg.query(`INSERT INTO "${tableName}" VALUES ($1)`, ["x' OR 1=1 --"]),
      ).rejects.toThrow(/check constraint/)
    }
  })

  it('binds a boolean as 0 or 1 on SQLite, whose drivers refuse a boolean', () => {
    const Row = Schema.Struct({ id: Schema.String, b: Schema.NullOr(Schema.Boolean) })
    const isTrue = Expr.in({ row: Row }, ({ row }) => Eq.is(row.b, true))
    const where = Result.getOrThrow(Sql.toWhere(isTrue, { dialect: 'sqlite' }))
    expect(where).toEqual({ text: '("b" IS ?)', params: [1] })
    expect(Result.getOrThrow(Sql.toWhere(isTrue)).params).toEqual([true])
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE "t" ("id" TEXT, "b" INTEGER)`)
    db.exec(`INSERT INTO "t" VALUES ('a', 1), ('b', 0), ('c', NULL)`)
    expect(sqliteRows(db, where, `SELECT "id" FROM "t"`)).toEqual([{ id: 'a' }])
  })
})

describe('a CHECK and the Schema refuse the same rows', () => {
  const Shape = Schema.Struct({ x: Schema.NullOr(Schema.Int) })
  // The operators take no nullable operand by type; this path reads the column as the number it may not be.
  const x = Path.make<typeof Shape.Type, number>(['x'])
  const Stock = Shape.pipe(Expr.refine(() => Bool.not(Ord.lte(x, 0))))
  const cases: ReadonlyArray<number | null> = [5, 0, -1, null]

  it('on Postgres', async () => {
    await pg.exec(`CREATE TABLE "stock" ("x" INTEGER, ${Result.getOrThrow(Sql.toCheck(Stock))})`)
    for (const x of cases) {
      const stored = await pg.query(`INSERT INTO "stock" VALUES ($1)`, [x]).then(
        () => true,
        () => false,
      )
      expect([x, stored]).toEqual([x, Schema.is(Stock)({ x })])
    }
  })

  it('on SQLite', () => {
    const db = new DatabaseSync(':memory:')
    const check = Result.getOrThrow(Sql.toCheck(Stock, { dialect: 'sqlite' }))
    db.exec(`CREATE TABLE "stock" ("x" INTEGER, ${check})`)
    const insert = db.prepare(`INSERT INTO "stock" VALUES (?)`)
    for (const x of cases) {
      let stored = true
      try {
        insert.run(x)
      } catch {
        stored = false
      }
      expect([x, stored]).toEqual([x, Schema.is(Stock)({ x })])
    }
  })
})
