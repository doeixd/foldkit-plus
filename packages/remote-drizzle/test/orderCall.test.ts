/**
 * A list ordered by a call, compiled to SQL and paged by its keys: every page
 * of it, on SQLite and on Postgres, joins up to the order the reference
 * interpreter gives. expr-operations-DESIGN §8.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { PgDialect, integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { Effect, Schema } from 'effect'
import {
  Collation,
  Entity,
  Expr,
  Operators,
  Order,
  Query as Relational,
  evaluate,
  type AnyQuery,
} from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileOrderBy } from '../src/compile.js'
import { DrizzleOperators, databaseLayer, entity, orderByTerms, query } from '../src/index.js'

const Part = Entity.define(
  'Part',
  Schema.Struct({ id: Schema.String, code: Schema.String, rank: Schema.Int }),
).pipe(Entity.annotateMembers({ code: Collation.of(Collation.binary) }))
const { fields } = Part

const distance = Expr.operator('acme.distance', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
})
const joined = Expr.operator('acme.joined', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
})
/** A distance from zero, defined by the primitive one: compiled as what it means. */
const size = Expr.operator('acme.size', {
  input: [Schema.Int],
  output: Schema.Int,
  definedAs: rank => distance(rank, 0),
})
const operators = {
  memory: Operators.merge(
    Operators.kernel,
    Operators.memory(
      Operators.implement(distance, (rank, target) => Math.abs(rank - target)),
      Operators.implement(joined, (left, right) => `${left}${right}`),
    ),
  ),
  sql: DrizzleOperators.merge(
    DrizzleOperators.kernel,
    DrizzleOperators.make(
      DrizzleOperators.implement(
        distance,
        ({ args: [rank, target] }) => sql`abs(${rank} - ${target})`,
      ),
      DrizzleOperators.implement(joined, ({ args: [left, right] }) => sql`(${left} || ${right})`),
    ),
  ),
}

const target = Expr.input('target', Schema.Int)
const sort = Expr.input(
  'sort',
  Schema.NullOr(
    Schema.Struct({
      by: Schema.Literals(['near', 'code']),
      direction: Schema.Literals(['asc', 'desc']),
    }),
  ),
)
const bodies = {
  Nearest: Relational.from(Part).pipe(Relational.orderBy(Order.asc(distance(fields.rank, target)))),
  Farthest: Relational.from(Part).pipe(
    Relational.orderBy(Order.desc(distance(fields.rank, target))),
  ),
  // ASCII case folded, though `code` itself is binary: the term's collation is the call's.
  Folded: Relational.from(Part).pipe(
    Relational.orderBy(Order.asc(joined(fields.code, '!'), { collation: Collation.asciiFold })),
  ),
  Bigger: Relational.from(Part).pipe(Relational.orderBy(Order.desc(size(fields.rank)))),
  Chosen: Relational.from(Part).pipe(
    Relational.orderBy(
      Order.chosen(sort, { near: distance(fields.rank, target), code: fields.code }),
    ),
  ),
}
const Input = { target: Schema.Int, sort: sort.schema }
const descriptorOf = (name: keyof typeof bodies) => ({
  ...Query.make(name, { Input, Result: Query.connection(Part) }),
  body: bodies[name],
})

const rows = [
  { id: 'p1', code: 'b', rank: 3 },
  { id: 'p2', code: 'A', rank: 7 },
  { id: 'p3', code: 'a', rank: 5 },
  { id: 'p4', code: 'B', rank: 5 },
  { id: 'p5', code: 'c', rank: 9 },
  { id: 'p6', code: 'C', rank: 1 },
  { id: 'p7', code: '_', rank: 5 },
  { id: 'p8', code: 'b', rank: 6 },
]
const create = 'create table parts (id text primary key, code text not null, rank integer not null)'
const sqliteParts = sqliteTable('parts', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  rank: integer('rank').notNull(),
})
const pgParts = pgTable('parts', {
  id: pgText('id').primaryKey(),
  code: pgText('code').notNull(),
  rank: pgInteger('rank').notNull(),
})

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(create)
for (const row of rows)
  sqlite.prepare('insert into parts values (?, ?, ?)').run(row.id, row.code, row.rank)
const pglite = new PGlite()
beforeAll(async () => {
  await pglite.exec(create)
  for (const row of rows) {
    await pglite.query('insert into parts values ($1, $2, $3)', [row.id, row.code, row.rank])
  }
}, 60_000)
afterAll(async () => {
  sqlite.close()
  await pglite.close()
})

const backends = [
  [
    'SQLite',
    () => ({
      target: entity('Part', sqliteParts, { operators }),
      layer: databaseLayer(drizzle({ client: sqlite })),
    }),
  ],
  [
    'Postgres',
    () => ({
      target: entity('Part', pgParts, { operators }),
      layer: databaseLayer(drizzlePg({ client: pglite })),
    }),
  ],
] as const

/** Every id the query lists, a page of `size` at a time, each page after the last one's cursor. */
const paged = async (
  name: keyof typeof bodies,
  input: Readonly<Record<string, unknown>>,
  backend: (typeof backends)[number][1],
  size: number,
) => {
  const { target: binding, layer } = backend()
  const run = query(descriptorOf(name), { entity: binding })
  const ids: Array<string> = []
  let after: string | undefined
  for (let page = 0; page < rows.length; page++) {
    const answer = await Effect.runPromise(
      run
        .run({
          input: { target: 0, sort: null, ...input },
          window: after === undefined ? { first: size } : { first: size, after },
          principal: null,
        })
        .pipe(Effect.provide(layer)),
    )
    ids.push(...answer.edges.map(edge => edge.id))
    if (answer.end._tag !== 'Cursor') return ids
    after = answer.end.cursor
  }
  throw new Error('the pages never ended')
}

/** The order the reference interpreter gives the same rows. */
const reference = (body: AnyQuery, input: Readonly<Record<string, unknown>>) =>
  evaluate(body, { target: 0, sort: null, ...input }, rows, { operators: operators.memory }).map(
    row => row.id,
  )

const cases: ReadonlyArray<readonly [keyof typeof bodies, Readonly<Record<string, unknown>>]> = [
  ['Nearest', { target: 5 }],
  ['Farthest', { target: 5 }],
  ['Folded', {}],
  ['Bigger', {}],
  ['Chosen', { target: 6, sort: { by: 'near', direction: 'desc' } }],
]

describe.each(backends)('A list ordered by a call on %s', (_, backend) => {
  it.each(cases)(
    'pages %s as the reference orders it, ties by id, at every page size',
    async (name, input) => {
      const expected = reference(bodies[name], input)
      // The fixture's order differs from its ids', so a page that ignored the call would show.
      expect(expected).not.toEqual([...expected].sort())
      for (const size of [1, 2, 3])
        expect(await paged(name, input, backend, size)).toEqual(expected)
    },
  )
})

describe('A call order compiled', () => {
  it('casts its parameter on Postgres and says where nulls go', () => {
    const terms = compileOrderBy(
      bodies.Nearest,
      entity('Part', pgParts, { operators }),
      { target: 5, sort: null },
      'Nearest',
    )
    const [first] = orderByTerms(terms, 'forward')
    expect(new PgDialect().sqlToQuery(first!).sql).toBe(
      'abs("parts"."rank" - cast($1 as integer)) asc nulls last',
    )
  })

  it('folds text under its collation, on Postgres as lower(… collate "C")', () => {
    const terms = compileOrderBy(
      bodies.Folded,
      entity('Part', pgParts, { operators }),
      {},
      'Folded',
    )
    const [first] = orderByTerms(terms, 'forward')
    expect(new PgDialect().sqlToQuery(first!).sql).toBe(
      'lower(("parts"."code" || $1) collate "C") asc nulls last',
    )
  })

  it('is refused at registration by a binding that cannot run it, a chosen alternative too', () => {
    const bare = entity('Part', sqliteParts)
    for (const name of ['Nearest', 'Chosen'] as const) {
      expect(() => query(descriptorOf(name), { entity: bare })).toThrow(
        `query "${name}" needs acme.distance, which this compiler does not run`,
      )
    }
  })
})
