/**
 * The reference interpreter, and the claim it exists to support: one query body
 * means the same thing here and in SQL.
 *
 * The differential tests run the body two ways — through `evaluate` over rows
 * in memory, and as SQL against a real SQLite — and require the same ids in the
 * same order. A body that means two things is a bug in whichever is wrong, and
 * these say which.
 */
import { Schema } from 'effect'
import { Entity, Expr, Order, Query } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { QueryEvaluateError, evaluate, type Row } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    slug: Schema.String,
    rank: Schema.Number,
    archivedAt: Schema.String,
  }),
)

const rows: ReadonlyArray<Row> = [
  { id: 'a', slug: 'intro', rank: 2, archivedAt: null },
  { id: 'b', slug: 'intro', rank: 1, archivedAt: '2026-01-01' },
  { id: 'c', slug: 'other', rank: 3, archivedAt: null },
  { id: 'd', slug: 'other', rank: 3, archivedAt: null },
]

/** The same rows in SQLite, to run the same body as SQL. */
const database = () => {
  const db = new DatabaseSync(':memory:')
  db.exec('create table posts (id text primary key, slug text, rank integer, archived_at text)')
  const insert = db.prepare('insert into posts values (?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(
      row.id as string,
      row.slug as string,
      row.rank as number,
      row.archivedAt as string | null,
    )
  }
  return db
}

const column: Readonly<Record<string, string>> = {
  id: 'id',
  slug: 'slug',
  rank: 'rank',
  archivedAt: 'archived_at',
}

/** The body as SQL, written the way `foldkit-remote-drizzle` compiles one. */
const asSql = (body: ReturnType<typeof Query.from>, input: Row) => {
  const params: unknown[] = []
  const where = body.where.map(node => {
    if (node._tag !== 'Eq') throw new Error('unsupported')
    const side = (operand: (typeof node)['left']): string => {
      if (operand._tag === 'Field') return `"${column[operand.key]}"`
      params.push(operand._tag === 'Input' ? input[operand.key] : operand.value)
      return '?'
    }
    // Column first, as the compiler normalises it.
    return node.left._tag === 'Field'
      ? `${side(node.left)} = ${side(node.right)}`
      : `${side(node.right)} = ${side(node.left)}`
  })
  const order = body.orderBy.map(term => {
    if (term.expr._tag !== 'Field') throw new Error('unsupported')
    return `"${column[term.expr.key]}" ${term.direction}`
  })
  return {
    sql: `select id from posts${where.length === 0 ? '' : ` where ${where.join(' and ')}`}${
      order.length === 0 ? '' : ` order by ${order.join(', ')}`
    }`,
    params,
  }
}

const bothWays = (body: ReturnType<typeof Query.from>, input: Row = {}) => {
  const inMemory = evaluate(body, input, rows).map(row => row.id)
  const { sql, params } = asSql(body, input)
  const db = database()
  const inSql = db
    .prepare(sql)
    .all(...(params as never[]))
    .map(row => (row as Row).id)
  return { inMemory, inSql, sql }
}

describe('One body, two interpreters, the same rows', () => {
  it.each([
    {
      what: 'a field against a literal',
      body: () => Query.from(Post).pipe(Query.where(Expr.eq(Post.fields.slug, 'intro'))),
      input: {},
    },
    {
      what: 'a field against an input',
      body: () =>
        Query.from(Post).pipe(
          Query.where(Expr.eq(Post.fields.slug, Expr.input('s', Schema.String))),
        ),
      input: { s: 'other' },
    },
    {
      what: 'two predicates, which conjoin',
      body: () =>
        Query.from(Post).pipe(
          Query.where(Expr.eq(Post.fields.slug, 'other')),
          Query.where(Expr.eq(Post.fields.rank, 3)),
        ),
      input: {},
    },
    {
      what: 'an input that matches nothing',
      body: () =>
        Query.from(Post).pipe(
          Query.where(Expr.eq(Post.fields.slug, Expr.input('s', Schema.String))),
        ),
      input: { s: 'absent' },
    },
    {
      what: 'no predicate at all',
      body: () => Query.from(Post),
      input: {},
    },
    {
      what: 'an ordering on one column',
      body: () => Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.rank))),
      input: {},
    },
    {
      what: 'an ordering broken by a second term',
      body: () =>
        Query.from(Post).pipe(
          Query.orderBy(Order.desc(Post.fields.rank), Order.asc(Post.fields.id)),
        ),
      input: {},
    },
    {
      what: 'a predicate and an ordering together',
      body: () =>
        Query.from(Post).pipe(
          Query.where(Expr.eq(Post.fields.slug, 'other')),
          Query.orderBy(Order.desc(Post.fields.id)),
        ),
      input: {},
    },
  ])('agrees on $what', ({ body, input }) => {
    const { inMemory, inSql } = bothWays(body(), input)

    expect(inMemory).toEqual(inSql)
  })

  it('agrees that a null never equals anything, including another null', () => {
    // JavaScript would call `null === null` true and keep rows a, c and d.
    // SQL calls it unknown and keeps none. This follows SQL.
    const body = Query.from(Post).pipe(
      Query.where(Expr.eq(Post.fields.archivedAt, Expr.input('at', Schema.String))),
    )

    const { inMemory, inSql } = bothWays(body, { at: null })

    expect(inSql).toEqual([])
    expect(inMemory).toEqual(inSql)
  })

  it('agrees that a null column does not match a value either', () => {
    const body = Query.from(Post).pipe(Query.where(Expr.eq(Post.fields.archivedAt, '2026-01-01')))

    const { inMemory, inSql } = bothWays(body)

    expect(inSql).toEqual(['b'])
    expect(inMemory).toEqual(inSql)
  })
})

describe('What the reference interpreter will not answer for', () => {
  it('refuses to order by a column that is null in some row', () => {
    // SQLite sorts nulls first; Postgres sorts them last for `asc`. The
    // databases disagree with each other, so there is no answer to be
    // conformant to, and guessing one would make this interpreter wrong
    // against whichever it did not pick.
    const body = Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.archivedAt)))

    expect(() => evaluate(body, {}, rows)).toThrow(QueryEvaluateError)
    expect(() => evaluate(body, {}, rows)).toThrow('where nulls sort is a thing databases disagree')
  })

  it('refuses to compare values of kinds it has no order for', () => {
    const mixed: ReadonlyArray<Row> = [
      { id: 'a', rank: 1 },
      { id: 'b', rank: 'two' },
    ]
    const body = Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.rank)))

    expect(() => evaluate(body, {}, mixed)).toThrow('cannot compare')
  })

  it('leaves the rows it was given alone', () => {
    const body = Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.rank)))
    const before = rows.map(row => row.id)

    evaluate(body, {}, rows)

    expect(rows.map(row => row.id)).toEqual(before)
  })
})
