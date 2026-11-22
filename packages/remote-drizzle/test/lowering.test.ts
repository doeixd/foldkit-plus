/**
 * What the SQL compiler does with metakit's lowering (step 8 of the kernel
 * convergence note): the meanings that change where the database and the page
 * now agree, and the places SQL is written for the database, not for metakit's
 * text. The rows come out the same, which `lowering.differential.test.ts`
 * holds; this holds the SQL and the refusals.
 */
import { postgres } from '../src/pg.js'
import { PgDialect, pgTable, integer as pgInteger, text as pgText } from 'drizzle-orm/pg-core'
import { SQLiteDialect, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Option, Schema } from 'effect'
import { Collation, Computation, Entity, Expr, Text, type Predicate } from 'foldkit-entity'
import type { SQL } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  compilePredicates,
  computationSql,
  entity,
  QueryCompileError,
  type CompileTarget,
} from '../src/index.js'

postgres()

const Lane = Entity.define(
  'Lane',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    count: Schema.Int,
    weight: Schema.Number,
  }),
).pipe(Entity.annotateMembers({ name: Collation.of(Collation.asciiFold) }))

const sqliteLanes = entity(
  'Lane',
  sqliteTable('lanes', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    count: integer('count').notNull(),
    weight: integer('weight').notNull(),
  }),
)
const pgLanes = entity(
  'Lane',
  pgTable('lanes', {
    id: pgText('id').primaryKey(),
    name: pgText('name').notNull(),
    count: pgInteger('count').notNull(),
    weight: pgInteger('weight').notNull(),
  }),
)

const lite = (value: SQL) => new SQLiteDialect().sqlToQuery(value)
const pg = (value: SQL) => new PgDialect().sqlToQuery(value)

const compile = (
  predicate: Predicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>> = {},
) => compilePredicates([predicate], target, input, 'Probe', Lane)[0]!

describe('a predicate that reads only the request is decided as metakit evaluates it', () => {
  const sum = Expr.gt(Expr.add(Expr.input('a', Schema.Number), Expr.input('b', Schema.Number)), 0)

  it('is a constant where the arithmetic is safe', () => {
    expect(lite(compile(sum, sqliteLanes, { a: 2, b: 3 })).sql).toBe('true')
    expect(lite(compile(sum, sqliteLanes, { a: -3, b: 2 })).sql).toBe('false')
  })

  it.each([
    ['SQLite', sqliteLanes],
    ['Postgres', pgLanes],
  ])('refuses arithmetic past the safe integer range, on %s', (_, target) => {
    expect(() => compile(sum, target, { a: Number.MAX_SAFE_INTEGER, b: 1 })).toThrow(
      QueryCompileError,
    )
    expect(() => compile(sum, target, { a: Number.MAX_SAFE_INTEGER, b: 1 })).toThrow(
      /unsafe-integer|safe integer|add/,
    )
  })

  it('folds an operand of a predicate that reads a column, so the database is asked a smaller question', () => {
    const where = Expr.gte(
      Lane.fields.weight,
      Expr.add(Expr.input('a', Schema.Number), Expr.input('b', Schema.Number)),
    )
    const compiled = compile(where, sqliteLanes, { a: 2, b: 3 })
    expect(lite(compiled)).toEqual({ sql: '"lanes"."weight" >= ?', params: [5] })
  })
})

describe('an operand the request settles', () => {
  const flag = Expr.input('flag', Schema.Boolean)
  // A decisive operand drops the other only where its Schema says it cannot be refused: an integer
  // cannot, a plain `Schema.String` (which may hold a NUL) or `Schema.Number` (NaN) can.
  const either = Expr.or(Expr.eq(flag, true), Expr.eq(Lane.fields.count, 3))
  const both = Expr.and(Expr.eq(flag, true), Expr.eq(Lane.fields.count, 3))

  it('decides an or when it is true, and leaves the other operand alone when it is false', () => {
    expect(lite(compile(either, sqliteLanes, { flag: true })).sql).toBe('true')
    expect(lite(compile(either, sqliteLanes, { flag: false }))).toEqual({
      sql: '"lanes"."count" = ?',
      params: [3],
    })
  })

  it('decides an and when it is false, and leaves the other operand alone when it is true', () => {
    expect(lite(compile(both, sqliteLanes, { flag: false })).sql).toBe('false')
    expect(lite(compile(both, sqliteLanes, { flag: true }))).toEqual({
      sql: '"lanes"."count" = ?',
      params: [3],
    })
  })

  it('is null where an input of arithmetic is null, or was not given, as SQL gives it', () => {
    const plus = Expr.gt(Expr.add(Lane.fields.weight, Expr.input('a', Schema.Number)), 0)
    expect(lite(compile(plus, sqliteLanes, { a: null })).sql).toBe('null')
    expect(lite(compile(plus, sqliteLanes, {})).sql).toBe('null')
  })
})

describe('who asks', () => {
  const mine = Expr.eq(Lane.fields.id, Expr.viewer(Lane))
  const asked = (viewer: Option.Option<{ readonly entity: string; readonly id: string }>) =>
    lite(compile(mine, { ...sqliteLanes, context: { viewer, now: Option.none() } })).sql

  it('is the id a viewer of the Entity gives', () => {
    expect(asked(Option.some({ entity: 'Lane', id: 'l1' }))).toBe('"lanes"."id" = ?')
  })

  it('is no one for a visitor, or a viewer of another Entity, so the comparison is null', () => {
    expect(asked(Option.none())).toBe('null')
    expect(asked(Option.some({ entity: 'Other', id: 'o1' }))).toBe('null')
  })
})

describe('a fraction beside an integer field', () => {
  it.each([
    ['SQLite', sqliteLanes],
    ['Postgres', pgLanes],
  ])('is refused, as a rounding no rule names, on %s', (_, target) => {
    expect(() => compile(Expr.eq(Expr.add(Lane.fields.count, 0.5), 2), target)).toThrow(
      'a fraction beside an integer column',
    )
  })

  it('is read as it is beside a number field, and typed so on Postgres', () => {
    const where = Expr.eq(Expr.add(Lane.fields.weight, 0.5), 2.5)
    expect(pg(compile(where, pgLanes))).toEqual({
      sql: '("lanes"."weight" + cast($1 as double precision)) = $2',
      params: [0.5, 2.5],
    })
    expect(lite(compile(where, sqliteLanes))).toEqual({
      sql: '("lanes"."weight" + ?) = ?',
      params: [0.5, 2.5],
    })
  })
})

describe('a list the request leaves out', () => {
  const among = Expr.in(Lane.fields.name, Expr.input('names', Schema.Array(Schema.String)))

  it('is SQL’s null, which a connective around it keeps', () => {
    expect(lite(compile(among, sqliteLanes, { names: null })).sql).toBe('null')
  })

  it('holds no row when it is empty', () => {
    expect(lite(compile(among, sqliteLanes, { names: [] })).sql).toMatch(/^false$/i)
  })
})

describe('a text comparison of a column under a collation', () => {
  it('names the collation on the column, where the database can index it', () => {
    const where = Expr.lt(Lane.fields.name, Expr.input('s', Schema.String))
    expect(lite(compile(where, sqliteLanes, { s: 'Mm' }))).toEqual({
      sql: '"lanes"."name" collate nocase < ?',
      params: ['mm'],
    })
    expect(pg(compile(where, pgLanes, { s: 'Mm' }))).toEqual({
      sql: 'lower("lanes"."name" collate "C") < lower($1 collate "C")',
      params: ['mm'],
    })
  })
})

describe('an operator that compares text itself', () => {
  it('is metakit’s own operation, so a table implements none of the kernel’s', () => {
    const where = Text.startsWith(Lane.fields.name, 'ab')
    expect(lite(compile(where, sqliteLanes)).sql).toBe(
      'substr(lower("lanes"."name"), 1, length(?)) = ?',
    )
  })
})

describe('a computed assignment', () => {
  const add = Computation.Call({
    operator: 'number.add',
    args: [Computation.Field({ key: 'count' }), Computation.Value({ value: 1 })],
  })

  it('types a number by its own value on Postgres, as no column types it', () => {
    expect(pg(computationSql(add, pgLanes, 'Lane.count'))).toEqual({
      sql: '"lanes"."count" + cast($1 as integer)',
      params: [1],
    })
    expect(lite(computationSql(add, sqliteLanes, 'Lane.count'))).toEqual({
      sql: '"lanes"."count" + ?',
      params: [1],
    })
  })

  it('reads a value past 32 bits as a bigint, and a fraction as a double', () => {
    const wide = Computation.Call({
      operator: 'number.add',
      args: [Computation.Field({ key: 'count' }), Computation.Value({ value: 3_000_000_000 })],
    })
    expect(pg(computationSql(wide, pgLanes, 'Lane.count')).sql).toBe(
      '"lanes"."count" + cast($1 as bigint)',
    )
    const fraction = Computation.Call({
      operator: 'number.add',
      args: [Computation.Field({ key: 'weight' }), Computation.Value({ value: 0.5 })],
    })
    expect(pg(computationSql(fraction, pgLanes, 'Lane.weight')).sql).toBe(
      '"lanes"."weight" + cast($1 as double precision)',
    )
  })

  it('refuses an operator no table of the binding names', () => {
    expect(() =>
      computationSql(
        Computation.Call({ operator: 'acme.nothing', args: [] }),
        sqliteLanes,
        'Lane.count',
      ),
    ).toThrow("which this binding's SQL operators do not run")
  })
})
