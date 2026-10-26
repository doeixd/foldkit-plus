/**
 * Primitive operators held to their memory implementations by the conformance
 * helper: each generated call, null, NUL, mixed case under each collation,
 * non-ASCII and astral text among them, selected from SQLite and Postgres and
 * compared with what the reference interpreter answers.
 * expr-operations-DESIGN §10.4.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql, type SQL } from 'drizzle-orm'
import { PgDialect, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { SQLiteDialect, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Schema } from 'effect'
import { Conformance, type Runner } from 'foldkit-entity/conformance'
import { Expr, Law, Operators, Text, isPredicate } from 'foldkit-entity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DrizzleOperators, compileCall, entity, type CompileTarget } from '../src/index.js'

/** Text after text, under the collation its operands share. */
const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
  laws: [Law.associative, Law.identity('')],
})
const operators = {
  memory: Operators.merge(
    Operators.kernel,
    Operators.memory(Operators.implement(concat, (left, right) => `${left}${right}`)),
  ),
  sql: DrizzleOperators.merge(
    DrizzleOperators.kernel,
    DrizzleOperators.make(
      DrizzleOperators.implement(concat, ({ args: [left, right] }) => sql`(${left} || ${right})`),
    ),
  ),
}

const sqliteThings = sqliteTable('things', { id: text('id').primaryKey() })
const pgThings = pgTable('things', { id: pgText('id').primaryKey() })
const sqlite = new DatabaseSync(':memory:')
const pglite = new PGlite()
beforeAll(() => pglite.waitReady, 60_000)
afterAll(async () => {
  sqlite.close()
  await pglite.close()
})

/** A call selected from a database: its value, a predicate's truth as a boolean or null. */
const selecting =
  (
    binding: CompileTarget,
    render: (query: SQL) => { readonly sql: string; readonly params: ReadonlyArray<unknown> },
    run: (text: string, params: ReadonlyArray<unknown>) => Promise<unknown>,
  ): Runner =>
  async call => {
    const query = render(sql`select ${compileCall(call, binding, 'conformance')} as value`)
    const value = await run(query.sql, query.params)
    // SQLite answers a truth as 1 or 0.
    return isPredicate(call) && typeof value === 'number' ? value === 1 : value
  }

const databases = {
  sqlite: selecting(
    entity('Thing', sqliteThings, { operators }),
    query => new SQLiteDialect().sqlToQuery(query),
    async (text, params) =>
      (sqlite.prepare(text).get(...(params as Array<string | number | null>)) as { value: unknown })
        .value,
  ),
  postgres: selecting(
    entity('Thing', pgThings, { operators }),
    query => new PgDialect().sqlToQuery(query),
    async (text, params) =>
      (await pglite.query<{ value: unknown }>(text, [...params])).rows[0]!.value,
  ),
}

describe.each(Object.entries(databases))('Operators run by %s', (_, database) => {
  const implementations = { memory: Conformance.memory(operators.memory), database }

  it('Text.startsWith answers every generated call as memory does', async () => {
    const report = await Conformance.operator(Text.startsWith, { implementations })
    expect(report.cases).toBeGreaterThan(100)
    expect(report.disagreements).toEqual([])
  })

  it('an application’s concat answers every generated call as memory does', async () => {
    const report = await Conformance.operator(concat, { implementations })
    expect(report.cases).toBeGreaterThan(100)
    expect(report.disagreements).toEqual([])
  })
})

describe('The helper over a database', () => {
  it('finds an SQL implementation that folds case where memory does not', async () => {
    const folding = entity('Thing', sqliteThings, {
      operators: {
        ...operators,
        sql: DrizzleOperators.override(
          operators.sql,
          DrizzleOperators.implement(
            concat,
            ({ args: [left, right] }) => sql`lower(${left} || ${right})`,
          ),
        ),
      },
    })
    const report = await Conformance.operator(concat, {
      implementations: {
        memory: Conformance.memory(operators.memory),
        sqlite: selecting(
          folding,
          query => new SQLiteDialect().sqlToQuery(query),
          async (text, params) =>
            (sqlite.prepare(text).get(...(params as Array<string>)) as { value: unknown }).value,
        ),
      },
      cases: [
        ['a', 'b'],
        ['A', 'b'],
      ],
    })
    expect(report.disagreements.map(each => each.args)).toEqual([
      ['A', 'b'],
      ['A', 'b'],
    ])
  })
})

describe('compileCall', () => {
  it('refuses what is not a call, which has no SQL of its own to select', () => {
    const binding = entity('Thing', sqliteThings, { operators })
    expect(() => compileCall(Expr.literal('x'), binding, 'probe')).toThrow(
      'probe: only a call of an operator compiles alone',
    )
    expect(() => compileCall(Expr.isNull(Expr.literal('x')), binding, 'probe')).toThrow(
      'probe: only a call of an operator compiles alone',
    )
  })
})
