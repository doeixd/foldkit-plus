/**
 * Operators defined by an expression: a name for what a body means, which every
 * interpreter runs as that body. See `docs/design/expr-operations-DESIGN.md`.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Query, evaluate, truthOver } from '../src/index.js'

const Article = Entity.define(
  'Article',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    publishedAt: Schema.NullOr(Schema.String),
    rank: Schema.Number,
  }),
)
const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const { fields } = Article

const published = Expr.operator('cms.published', {
  input: [Schema.Unknown],
  output: Schema.Boolean,
  definedAs: publishedAt => Expr.isNotNull(publishedAt),
})
// A scalar result: what it means is its argument, so it compares as the argument does.
const rankOf = Expr.operator('acme.rankOf', {
  input: [Schema.Number],
  output: Schema.Number,
  definedAs: rank => rank,
})

const rows = [
  { id: 'a1', title: 'Out', publishedAt: '2026-10-01', rank: 1 },
  { id: 'a2', title: 'Draft', publishedAt: null, rank: 2 },
  { id: 'a3', title: 'Also out', publishedAt: '2026-10-02', rank: 3 },
]
const ids = (body: Query<typeof Article>, input: Record<string, unknown> = {}) =>
  evaluate(body, input, rows).map(row => row['id'])

describe('An operator defined by an expression', () => {
  it('is a predicate where its output is a boolean, and matches the rows its body does', () => {
    const byOperator = Query.from(Article).pipe(Query.where(published(fields.publishedAt)))
    const written = Query.from(Article).pipe(Query.where(Expr.isNotNull(fields.publishedAt)))
    expect(ids(byOperator)).toEqual(['a1', 'a3'])
    expect(ids(byOperator)).toEqual(ids(written))
  })

  it('is a scalar where its output is not, compared as its body is', () => {
    const body = Query.from(Article).pipe(Query.where(Expr.lt(rankOf(fields.rank), 3)))
    expect(ids(body)).toEqual(['a1', 'a2'])
  })

  it('stands where any predicate does: under `not`, inside `or`', () => {
    const body = Query.from(Article).pipe(
      Query.where(Expr.or(Expr.not(published(fields.publishedAt)), Expr.eq(fields.rank, 3))),
    )
    expect(ids(body)).toEqual(['a2', 'a3'])
  })

  it('prints as its name, its version after one, and never its body', () => {
    const later = Expr.operator('cms.published', {
      version: 2,
      input: [Schema.Unknown],
      output: Schema.Boolean,
      definedAs: publishedAt => Expr.isNotNull(publishedAt),
    })
    expect(Expr.show(published(fields.publishedAt))).toBe('cms.published(Article.publishedAt)')
    expect(Expr.show(later(fields.publishedAt))).toBe('cms.published@2(Article.publishedAt)')
    expect(Expr.show(Expr.lt(rankOf(fields.rank), 3))).toBe('acme.rankOf(Article.rank) < 3')
  })

  it('reads what its arguments read, and names itself once among what a body uses', () => {
    const read = Query.dependencies(
      Query.from(Article).pipe(
        Query.where(
          Expr.or(
            published(fields.publishedAt),
            Expr.lt(rankOf(fields.rank), Expr.input('below', Schema.Number)),
          ),
          published(fields.publishedAt),
        ),
      ),
    )
    expect(read.fields.map(field => field.key)).toEqual(['publishedAt', 'rank'])
    expect(read.inputs).toEqual(['below'])
    expect(read.operators.map(operator => operator.id)).toEqual(['cms.published', 'acme.rankOf'])
    // The operations an interpreter must run are its body's.
    expect(read.operations).toContain('isNotNull')
  })

  it('is refused over another Entity, as the field written out would be', () => {
    const elsewhere = Expr.operator('acme.named', {
      input: [Schema.String],
      output: Schema.Boolean,
      definedAs: name => Expr.eq(name, 'Ada'),
    })
    const named = elsewhere(Author.fields.name)
    expect(() =>
      // @ts-expect-error the call reads Author, and the query is from Article
      Query.from(Article).pipe(Query.where(named)),
    ).toThrow('reads Author.name, but the query is from Article')
  })
})

describe('A call of a defined operator', () => {
  it('refuses a body that reads what no argument holds', () => {
    const titled = Expr.operator('acme.titled', {
      input: [Schema.Number],
      output: Schema.Boolean,
      // Closes over a field instead of taking it: nothing reading the call would see it.
      definedAs: () => Expr.eq(fields.title, 'Out'),
    })
    expect(() => titled(fields.rank)).toThrow(
      'acme.titled: `definedAs` reads Article.title, which no argument holds; pass it as one',
    )
  })

  it('refuses an input the body reads that no argument is', () => {
    const below = Expr.operator('acme.below', {
      input: [Schema.Number],
      output: Schema.Boolean,
      definedAs: rank => Expr.lt(rank, Expr.input('limit', Schema.Number)),
    })
    expect(() => below(fields.rank)).toThrow('reads $limit, which no argument holds')
    expect(() => below(Expr.input('rank', Schema.Number))).toThrow('reads $limit')
  })

  // Each is a type error too; these are what an untyped caller meets.
  it.each([
    [
      'too few arguments',
      // @ts-expect-error it takes one argument
      () => published(),
      'takes 1 argument, given 0',
    ],
    [
      'a field stored as text where it takes a number',
      // @ts-expect-error the title is stored as text
      () => rankOf(fields.title),
      'argument 1 is stored as text, but the operator takes number',
    ],
    [
      'a value its input does not admit',
      // @ts-expect-error a string is not a number
      () => rankOf('three'),
      'argument 1 is "three", which the operator\'s input schema does not admit',
    ],
    [
      'a predicate where it takes no boolean',
      // @ts-expect-error a predicate is a boolean
      () => rankOf(Expr.isNull(fields.rank)),
      'argument 1 is a predicate, but the operator does not take a boolean',
    ],
  ])('refuses %s', (_, call, message) => {
    expect(call).toThrow(message)
  })

  it('refuses a boolean output whose body is a scalar', () => {
    const wrong = Expr.operator('acme.wrong', {
      input: [Schema.Number],
      output: Schema.Boolean,
      // @ts-expect-error a boolean output's body is a predicate
      definedAs: rank => rank,
    })
    expect(() => wrong(fields.rank)).toThrow(
      'its output is a boolean, so `definedAs` returns a predicate',
    )
  })

  it('refuses a scalar output whose body is a predicate', () => {
    const wrong = Expr.operator('acme.wrong', {
      input: [Schema.Number],
      output: Schema.Number,
      // @ts-expect-error a number output's body is a scalar
      definedAs: rank => Expr.isNull(rank),
    })
    expect(() => wrong(fields.rank)).toThrow(
      'its output is not a boolean, so `definedAs` returns a scalar',
    )
  })
})

describe('Expr.operator', () => {
  it.each([
    ['an id with no namespace', 'published', {}, 'namespaced lower camel case'],
    ['an id under foldkit.', 'foldkit.published', {}, 'reserved'],
    ['a version below one', 'cms.published', { version: 0 }, 'a positive integer'],
    ['a fractional version', 'cms.published', { version: 1.5 }, 'a positive integer'],
  ])('refuses %s', (_, id, extra, message) => {
    expect(() =>
      Expr.operator(id, {
        input: [Schema.Unknown],
        output: Schema.Boolean,
        definedAs: at => Expr.isNotNull(at),
        ...extra,
      }),
    ).toThrow(message)
  })

  it('keeps each call: a second call of it is a second node over its own arguments', () => {
    const first = published(fields.publishedAt)
    const second = published(Expr.input('at', Schema.NullOr(Schema.String)))
    expect(first).not.toBe(second)
    expect(first.operator).toBe(second.operator)
    expect(Expr.show(second)).toBe('cms.published($at)')
  })
})

describe('The node budget', () => {
  it('counts what a call means, not the one node it is written as', () => {
    // 600 nodes behind one call: two calls are 1,200, over the 1,000 a query may hold.
    const wide = Expr.operator('acme.wide', {
      input: [Schema.String],
      output: Schema.Boolean,
      definedAs: title =>
        Expr.or(
          Expr.eq(title, 'first'),
          Expr.eq(title, 'second'),
          ...Array.from({ length: 198 }, (_, index) => Expr.eq(title, `t${index}`)),
        ),
    })
    const once = Query.from(Article).pipe(Query.where(wide(fields.title)))
    expect(once.where).toHaveLength(1)
    expect(() =>
      Query.from(Article).pipe(Query.where(wide(fields.title), wide(fields.title))),
    ).toThrow('the predicates expand to more than 1000 nodes')
  })
})

describe('Expr.expanded', () => {
  it('writes each defined call out as its body, which compiles as if written by hand', () => {
    const call = Expr.and(published(fields.publishedAt), Expr.eq(rankOf(fields.rank), 2))
    const written = Expr.and(Expr.isNotNull(fields.publishedAt), Expr.eq(fields.rank, 2))
    expect(Expr.expanded(call)).toEqual(written)
    expect(Expr.show(Expr.expanded(call))).toBe(Expr.show(written))
  })

  it('builds the expansion of one node once', () => {
    const call = published(fields.publishedAt)
    expect(Expr.expanded(call)).toBe(Expr.expanded(call))
  })
})

describe('An invariant over a defined operator', () => {
  it('reads the row after a write through the call, and judges the value a write sets', () => {
    const after = published(Expr.next(fields.publishedAt))
    expect(truthOver(after, {}, {}, { publishedAt: '2026-10-03' })).toBe(true)
    // `substituteNext` reaches the field under the call, as it does one written out: the
    // value set decides it, though the row after holds nothing (which reads as null).
    expect(truthOver(Expr.substituteNext(after, { publishedAt: '2026-10-03' }), {}, {}, {})).toBe(
      true,
    )
  })
})
