/**
 * The reference interpreter, and the claim it exists to support: one query body
 * means the same thing here and in SQL.
 *
 * The differential tests run the body two ways — through `evaluate` over rows
 * in memory, and as SQL against a real SQLite — and require the same ids in the
 * same order. A body that means two things is a bug in whichever is wrong, and
 * these say which.
 */
import { Option, Schema } from 'effect'
import { Collation, Entity, Expr, Order, Query, isPredicate } from 'foldkit-entity'
import type { Operandish, Predicate } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { QueryEvaluateError, assertSupported, evaluate, supported, type Row } from '../src/index.js'

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
  { id: 'c', slug: 'Other', rank: 3, archivedAt: null },
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
  const escapeLike = (value: string) => value.replace(/[\\%_]/g, found => `\\${found}`)
  const side = (operand: Operandish): string => {
    if (isPredicate(operand)) return `(${predicate(operand)})`
    if (operand._tag === 'Field') return `"${column[operand.key]}"`
    if (operand._tag === 'Next') throw new Error('a query reads no row after a write')
    if (operand._tag === 'Call') throw new Error('unsupported')
    if (operand._tag === 'Viewer' || operand._tag === 'Now') throw new Error('unsupported')
    if (operand._tag === 'Path' || operand._tag === 'ViewerPath') throw new Error('unsupported')
    params.push(operand._tag === 'Input' ? input[operand.key] : operand.value)
    return '?'
  }
  const predicate = (node: Predicate): string => {
    switch (node._tag) {
      case 'Eq':
        // Column first, as the compiler normalises it.
        return isPredicate(node.left) || node.left._tag === 'Field'
          ? `${side(node.left)} = ${side(node.right)}`
          : `${side(node.right)} = ${side(node.left)}`
      case 'Null':
        return `${side(node.operand)} is ${node.present ? 'not null' : 'null'}`
      case 'Contains': {
        const search = node.search
        if (search._tag !== 'Input' && search._tag !== 'Literal') throw new Error('unsupported')
        const text = search._tag === 'Input' ? input[search.key] : search.value
        params.push(`%${escapeLike(text as string)}%`)
        return `lower(${side(node.value)}) like lower(?) escape '\\'`
      }
      case 'In': {
        const among = node.among
        if (among._tag !== 'Input' && among._tag !== 'Literal') throw new Error('unsupported')
        const list = (among._tag === 'Input' ? input[among.key] : among.value) as unknown[]
        if (list.length === 0) return 'false'
        params.push(...list)
        return `${side(node.value)} in (${list.map(() => '?').join(', ')})`
      }
      case 'And':
        return `(${node.operands.map(predicate).join(' and ')})`
      case 'Or':
        return `(${node.operands.map(predicate).join(' or ')})`
      case 'Not':
        return `not (${predicate(node.operand)})`
      case 'Test':
      case 'Exists':
        throw new Error('unsupported')
      case 'Compare': {
        const symbol = { lt: '<', lte: '<=', gt: '>', gte: '>=' }[node.operator]
        const collate = Option.match(node.collation, {
          onNone: () => '',
          onSome: collation =>
            collation._tag === 'AsciiFold' ? ' collate nocase' : ' collate binary',
        })
        return `${side(node.left)}${collate} ${symbol} ${side(node.right)}${collate}`
      }
    }
  }
  const where = body.where.map(predicate)
  const order = Query.orderFor(body, input).map(term => {
    if (term.expr._tag !== 'Field') throw new Error('unsupported')
    return `"${column[term.expr.key]}" ${term.direction} nulls ${term.nulls}`
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
    .all(...(params.map(p => (typeof p === 'boolean' ? Number(p) : p)) as never[]))
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

  // `archivedAt` is null on a, c and d, so a comparison of it is unknown there:
  // each expected list is SQL's three-valued answer, worked out by hand, so a
  // rule both interpreters got wrong still fails.
  const archived = (at: string) => Expr.eq(Post.fields.archivedAt, at)
  const slug = (to: string) => Expr.eq(Post.fields.slug, to)
  it.each([
    {
      what: 'and, false beating unknown',
      where: () => Expr.and(archived('2026-01-01'), Expr.eq(Post.fields.rank, 1)),
      ids: ['b'],
    },
    {
      what: 'or, true beating unknown',
      where: () => Expr.or(archived('never'), slug('intro')),
      ids: ['a', 'b'],
    },
    {
      what: 'not of an unknown, which stays unknown',
      where: () => Expr.not(archived('2026-01-01')),
      ids: [],
    },
    {
      what: 'not of an or that is unknown where nothing is true',
      where: () => Expr.not(Expr.or(slug('intro'), archived('never'))),
      ids: [],
    },
    {
      what: 'not of an and that is false where any operand is',
      where: () => Expr.not(Expr.and(slug('other'), archived('never'))),
      ids: ['a', 'b', 'c'],
    },
    {
      what: 'a comparison of a number, and of a null, which is unknown',
      where: () =>
        Expr.or(
          Expr.lt(Post.fields.rank, 2),
          Expr.gte(Post.fields.archivedAt, '2026', { collation: Collation.binary }),
        ),
      ids: ['b'],
    },
    {
      what: 'text compared by code point under binary',
      where: () => Expr.lt(Post.fields.slug, 'a', { collation: Collation.binary }),
      ids: ['c'],
    },
    {
      what: 'text compared with ASCII case folded',
      where: () => Expr.gte(Post.fields.slug, 'o', { collation: Collation.asciiFold }),
      ids: ['c', 'd'],
    },
    {
      what: 'everything but one value, nulls included',
      where: () => Expr.or(Expr.isNull(Post.fields.archivedAt), Expr.not(archived('2026-01-01'))),
      ids: ['a', 'c', 'd'],
    },
  ])('agrees on $what', ({ where, ids }) => {
    const body = Query.from(Post).pipe(
      Query.where(where()),
      Query.orderBy(Order.asc(Post.fields.id)),
    )

    const { inMemory, inSql } = bothWays(body)

    expect(inSql).toEqual(ids)
    expect(inMemory).toEqual(inSql)
  })

  it.each([
    { status: null, ids: ['a', 'b', 'c', 'd'] },
    { status: 'intro', ids: ['a', 'b'] },
  ])('agrees on an optional filter with $status', ({ status, ids }) => {
    const chosen = Expr.input('status', Schema.NullOr(Schema.String))
    const body = Query.from(Post).pipe(
      Query.where(Expr.whenGiven(chosen, given => Expr.eq(Post.fields.slug, given))),
      Query.orderBy(Order.asc(Post.fields.id)),
    )

    const { inMemory, inSql } = bothWays(body, { status })

    expect(inSql).toEqual(ids)
    expect(inMemory).toEqual(inSql)
  })

  it.each([
    { what: 'is not null', present: true },
    { what: 'is null', present: false },
  ])('agrees on $what', ({ present }) => {
    const body = Query.from(Post).pipe(
      Query.where(
        present ? Expr.isNotNull(Post.fields.archivedAt) : Expr.isNull(Post.fields.archivedAt),
      ),
      Query.orderBy(Order.asc(Post.fields.id)),
    )

    const { inMemory, inSql } = bothWays(body)

    expect(inMemory).toEqual(inSql)
    expect(inSql).toEqual(present ? ['b'] : ['a', 'c', 'd'])
  })

  it.each([
    { search: 'intr', ids: ['a', 'b'] },
    { search: 'OTHER', ids: ['c', 'd'] },
    { search: 'oTh', ids: ['c', 'd'] },
    { search: '', ids: ['a', 'b', 'c', 'd'] },
    { search: 'nothing', ids: [] },
    { search: '%', ids: [] },
    { search: '_', ids: [] },
  ])('agrees on containing $search', ({ search, ids }) => {
    const body = Query.from(Post).pipe(
      Query.where(Expr.contains(Post.fields.slug, Expr.input('q', Schema.String))),
      Query.orderBy(Order.asc(Post.fields.id)),
    )

    const { inMemory, inSql } = bothWays(body, { q: search })

    expect(inMemory).toEqual(inSql)
    // An empty search is everything; `%` and `_` are searched for literally,
    // not as the wildcards SQL would otherwise read them as.
    expect(inSql).toEqual(ids)
  })

  it.each([
    { list: ['intro'], present: true, ids: ['a', 'b'] },
    { list: ['intro', 'Other'], present: true, ids: ['a', 'b', 'c'] },
    { list: [], present: true, ids: [] },
    { list: ['intro'], present: false, ids: ['c', 'd'] },
    // Nothing matched against a list holding a null is unknown, and so is
    // its negation: SQL keeps no row that is not in the list.
    { list: ['intro', null], present: false, ids: [] },
    { list: [], present: false, ids: ['a', 'b', 'c', 'd'] },
  ])('agrees on in $list, compared to $present', ({ list, present, ids }) => {
    const body = Query.from(Post).pipe(
      Query.where(
        Expr.eq(
          Expr.in(Post.fields.slug, Expr.input('slugs', Schema.Array(Schema.String))),
          Expr.input('present', Schema.Boolean),
        ),
      ),
      Query.orderBy(Order.asc(Post.fields.id)),
    )

    const { inMemory, inSql } = bothWays(body, { slugs: list, present })

    expect(inMemory).toEqual(inSql)
    expect(inSql).toEqual(ids)
  })

  it('agrees on the CMS worklist, asked without a branch', () => {
    // `archived ? isNotNull : isNull` and `search === '' ? skip : like`, as one
    // static body: is-archived equals what you asked, and the slug contains
    // what you asked.
    const body = Query.from(Post).pipe(
      Query.where(
        Expr.eq(Expr.isNotNull(Post.fields.archivedAt), Expr.input('archived', Schema.Boolean)),
        Expr.contains(Post.fields.slug, Expr.input('search', Schema.String)),
      ),
      Query.orderBy(Order.asc(Post.fields.id)),
    )

    for (const archived of [true, false]) {
      for (const search of ['', 'intro', 'zzz']) {
        const { inMemory, inSql } = bothWays(body, { archived, search })
        expect({ archived, search, rows: inMemory }).toEqual({ archived, search, rows: inSql })
      }
    }
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

describe('Where rows without a value go, said on the term', () => {
  // SQLite sorts nulls first ascending and Postgres last, when nothing says.
  // A term always says, and SQL is told the same, so the two agree.
  it.each([
    ['ascending, nulls last by default', Order.asc(Post.fields.archivedAt), ['b', 'a', 'c', 'd']],
    [
      'descending, nulls first by default',
      Order.desc(Post.fields.archivedAt),
      ['a', 'c', 'd', 'b'],
    ],
    [
      'ascending, nulls first when said',
      Order.asc(Post.fields.archivedAt, { nulls: 'first' }),
      ['a', 'c', 'd', 'b'],
    ],
  ])('%s', (_, term, expected) => {
    const { inMemory, inSql } = bothWays(Query.from(Post).pipe(Query.orderBy(term)))
    expect(inMemory).toEqual(expected)
    expect(inSql).toEqual(expected)
  })
})

describe('What the reference interpreter will not answer for', () => {
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

describe('An interpreter refuses what it does not run', () => {
  it('declares the operations it runs rather than leaving them implied', () => {
    expect([...supported].sort()).toEqual([
      'and',
      'compare',
      'contains',
      'eq',
      'in',
      'isNotNull',
      'isNull',
      'not',
      'now',
      'or',
      'viewer',
    ])
  })

  it('refuses a body needing an operation it does not run, naming it', () => {
    const body = Query.from(Post).pipe(Query.where(Expr.contains(Post.fields.slug, 'x')))
    // What a narrower interpreter — a REST source that only compares — would see.
    const missing = Query.unsupported(body, ['eq'])

    expect(missing).toEqual(['contains'])
  })

  it('does not silently skip an operation it cannot run', () => {
    // The failure this guards against: dropping `contains` and answering the
    // rows `eq` alone matches, which is a different question answered in full
    // confidence. `assertSupported` is what makes that impossible.
    const body = Query.from(Post).pipe(Query.where(Expr.contains(Post.fields.slug, 'intro')))

    expect(() => assertSupported(body)).not.toThrow()
    expect(Query.unsupported(body, ['eq', 'isNull', 'isNotNull'])).toEqual(['contains'])
  })
})
