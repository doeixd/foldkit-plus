import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Order,
  Query,
  dependenciesOf,
  type Operation,
  type Predicate,
} from '../src/index.js'
import { Blog } from './blogFixture.js'

const { Post } = Blog

describe('Expr builds a comparison as data', () => {
  it('coerces a field and a literal, and performs no work doing it', () => {
    const predicate = Expr.eq(Post.fields.title, 'hello')

    expect(predicate).toEqual({
      _tag: 'Eq',
      left: { _tag: 'Field', owner: Post.identity, key: 'title', schema: Post.fields.title.schema },
      right: { _tag: 'Literal', value: 'hello' },
    })
  })

  it('keeps an input a placeholder, not the value it will be given', () => {
    const slug = Expr.input('slug', Schema.String)
    const predicate = Expr.eq(Post.fields.title, slug)

    expect(predicate.right).toBe(slug)
    expect(predicate.right).toEqual({ _tag: 'Input', key: 'slug', schema: Schema.String })
  })

  it('carries the Entity identity, so two Entities of one name are two fields', () => {
    const Other = Blog.Comment
    const here = Expr.eq(Post.fields.id, 'p1')
    const there = Expr.eq(Other.fields.id, 'p1')

    expect(here.left).not.toEqual(there.left)
    expect((here.left as { readonly owner: unknown }).owner).toBe(Post.identity)
  })

  it('converts a field once: a FieldExpr given again is the same value', () => {
    const once = Expr.field(Post.fields.title)
    const twice = Expr.eq(once, 'hello')

    expect(twice.left).toEqual(once)
  })

  it('compares two fields', () => {
    const predicate = Expr.eq(Post.fields.title, Expr.field(Post.fields.id))

    expect(predicate.left._tag).toBe('Field')
    expect(predicate.right._tag).toBe('Field')
  })
})

describe('Order is a term over a scalar', () => {
  it('takes a field or an expression, in either direction', () => {
    expect(Order.asc(Post.fields.id)).toEqual({
      _tag: 'Term',
      direction: 'asc',
      expr: Expr.field(Post.fields.id),
    })
    expect(Order.desc(Expr.field(Post.fields.title)).direction).toBe('desc')
  })
})

describe('Order.chosen orders by the field the input names', () => {
  const sort = Expr.input(
    'sort',
    Schema.NullOr(
      Schema.Struct({
        by: Schema.Literals(['title', 'id']),
        direction: Schema.Literals(['asc', 'desc']),
      }),
    ),
  )
  const body = Query.from(Post).pipe(
    Query.orderBy(Order.chosen(sort, { title: Post.fields.title, id: Post.fields.id })),
  )

  it('resolves, per input, to the one term it names, or to none, then the id', () => {
    expect(Query.orderFor(body, { sort: { by: 'title', direction: 'desc' } })).toEqual([
      Order.desc(Post.fields.title),
      Order.asc(Post.fields.id),
    ])
    expect(Query.orderFor(body, { sort: null })).toEqual([Order.asc(Post.fields.id)])
  })

  it('ends on the id once: an order that reads it already is total', () => {
    expect(Query.orderFor(body, { sort: { by: 'id', direction: 'desc' } })).toEqual([
      Order.desc(Post.fields.id),
    ])
  })

  it('refuses an input naming no order it offers, or no direction it knows', () => {
    expect(() => Query.orderFor(body, { sort: { by: 'published', direction: 'asc' } })).toThrow(
      /names no order it offers/,
    )
    expect(() => Query.orderFor(body, { sort: { by: 'title', direction: 'up' } })).toThrow(
      /names no order it offers/,
    )
    // A name an object has from its prototype is not an order it offers.
    expect(() => Query.orderFor(body, { sort: { by: 'constructor', direction: 'asc' } })).toThrow(
      /names no order it offers/,
    )
  })

  it('reads every field it may choose, and the input that chooses', () => {
    const read = Query.dependencies(body)
    expect(read.order.map(field => field.key)).toEqual(['title', 'id'])
    expect(read.inputs).toEqual(['sort'])
  })

  it('is shown as the input among its choices', () => {
    expect(Query.show(body)).toBe(
      'FROM Post\nORDER BY $sort among (title: Post.title, id: Post.id)',
    )
  })

  it('refuses a choice from another Entity than the query reads', () => {
    expect(() =>
      Query.from(Post).pipe(
        Query.orderBy(Order.chosen(sort, { title: Blog.Author.fields.name, id: Post.fields.id })),
      ),
    ).toThrow(/reads Author\.name, but the query is from Post/)
  })

  it('refuses a choice that is not a field', () => {
    expect(() =>
      Order.chosen(
        Expr.input(
          'sort',
          Schema.NullOr(
            Schema.Struct({
              by: Schema.Literals(['x']),
              direction: Schema.Literals(['asc', 'desc']),
            }),
          ),
        ),
        {
          x: Expr.literal(1),
        },
      ),
    ).toThrow(/"x" is not a field/)
  })
})

describe('dependenciesOf says what an expression reads', () => {
  it('names the fields, the inputs, and the operations', () => {
    const predicate = Expr.eq(Post.fields.title, Expr.input('title', Schema.String))

    expect(dependenciesOf(predicate)).toEqual({
      fields: [{ entity: 'Post', key: 'title', owner: Post.identity }],
      inputs: ['title'],
      operations: ['eq'],
    })
  })

  it('counts a field once however often it is read', () => {
    const left = Expr.eq(Post.fields.id, 'p1')
    const right = Expr.eq(Post.fields.id, Expr.input('id', Schema.String))

    expect(dependenciesOf(left, right).fields).toEqual([
      { entity: 'Post', key: 'id', owner: Post.identity },
    ])
  })

  it('reads an ordering term as well as a predicate', () => {
    const found = dependenciesOf(
      Expr.eq(Post.fields.published, true),
      Order.desc(Post.fields.title),
      Order.asc(Post.fields.id),
    )

    expect(found.fields).toEqual([
      { entity: 'Post', key: 'published', owner: Post.identity },
      { entity: 'Post', key: 'title', owner: Post.identity },
      { entity: 'Post', key: 'id', owner: Post.identity },
    ])
    expect(found.inputs).toEqual([])
  })

  it('finds nothing in a comparison of two constants', () => {
    expect(dependenciesOf(Expr.eq(Expr.literal(1), 1))).toEqual({
      fields: [],
      inputs: [],
      operations: ['eq'],
    })
  })

  it('is the bySlug body of the CMS, which is what this kernel was sized to', () => {
    // packages/cms-drizzle/src/index.ts — `where: input => eq(column, input.slug)`
    // with `orderBy: [{ column: id, direction: 'asc' }]`.
    const where: Predicate = Expr.eq(Post.fields.title, Expr.input('slug', Schema.String))
    const order = [Order.asc(Post.fields.id)]

    expect(dependenciesOf(where, ...order)).toEqual({
      fields: [
        { entity: 'Post', key: 'title', owner: Post.identity },
        { entity: 'Post', key: 'id', owner: Post.identity },
      ],
      inputs: ['slug'],
      operations: ['eq'],
    })
  })
})

describe('Query composes which rows, as data', () => {
  const published = Expr.eq(Post.fields.published, true)
  const byTitle = Expr.eq(Post.fields.title, Expr.input('title', Schema.String))

  it('starts as every row of an Entity, with nothing said about them', () => {
    const all = Query.from(Post)

    expect(all.entity).toBe(Post)
    expect(all.where).toEqual([])
    expect(all.orderBy).toEqual([])
  })

  it('conjoins two wheres: the second narrows, it does not replace', () => {
    const both = Query.from(Post).pipe(Query.where(published), Query.where(byTitle))

    expect(both.where).toEqual([published, byTitle])
  })

  it('appends two orderings, so the earlier term stays the more significant', () => {
    const ordered = Query.from(Post).pipe(
      Query.orderBy(Order.desc(Post.fields.title)),
      Query.orderBy(Order.asc(Post.fields.id)),
    )

    expect(ordered.orderBy).toEqual([Order.desc(Post.fields.title), Order.asc(Post.fields.id)])
  })

  it('takes several predicates or terms at once, the same as several calls', () => {
    const together = Query.from(Post).pipe(Query.where(published, byTitle))
    const apart = Query.from(Post).pipe(Query.where(published), Query.where(byTitle))

    expect(together.where).toEqual(apart.where)
  })

  it('leaves the query it was given alone: each step is a new value', () => {
    const all = Query.from(Post)
    const narrowed = all.pipe(Query.where(published))

    expect(all.where).toEqual([])
    expect(narrowed).not.toBe(all)
  })

  it('is frozen, so a step cannot be undone by writing to one', () => {
    const all = Query.from(Post)

    expect(Object.isFrozen(all)).toBe(true)
    expect(Object.isFrozen(all.where)).toBe(true)
  })

  it('returns the same query when a step says nothing', () => {
    const all = Query.from(Post)

    expect(all.pipe(Query.where())).toBe(all)
    expect(all.pipe(Query.orderBy())).toBe(all)
  })

  it('reuses a fragment across queries over the same Entity', () => {
    const onlyPublished = Query.where(published)
    const newest = Query.orderBy(Order.desc(Post.fields.title))

    const list = Query.from(Post).pipe(onlyPublished, newest)
    const one = Query.from(Post).pipe(onlyPublished, Query.where(byTitle))

    expect(list.where).toEqual([published])
    expect(one.where).toEqual([published, byTitle])
  })

  it('says what the whole query reads, and which fields decide membership and which order', () => {
    const q = Query.from(Post).pipe(Query.where(byTitle), Query.orderBy(Order.asc(Post.fields.id)))
    const title = { entity: 'Post', key: 'title', owner: Post.identity }
    const id = { entity: 'Post', key: 'id', owner: Post.identity }

    expect(Query.dependencies(q)).toEqual({
      fields: [title, id],
      inputs: ['title'],
      operations: ['eq'],
      predicate: [title],
      order: [id],
    })
  })

  it('names a field that both filters and orders in both roles, and once in fields', () => {
    const q = Query.from(Post).pipe(
      Query.where(byTitle),
      Query.orderBy(Order.desc(Post.fields.title), Order.asc(Post.fields.id)),
    )
    const keys = (fields: ReadonlyArray<{ readonly key: string }>) => fields.map(f => f.key)
    const found = Query.dependencies(q)

    expect(keys(found.fields)).toEqual(['title', 'id'])
    expect(keys(found.predicate)).toEqual(['title'])
    expect(keys(found.order)).toEqual(['title', 'id'])
  })
})

describe('The operations the CMS worklist needs', () => {
  it('asks whether a value is absent, either way round, as one node', () => {
    expect(Expr.isNull(Post.fields.title)).toEqual({
      _tag: 'Null',
      operand: Expr.field(Post.fields.title),
      present: false,
    })
    expect(Expr.isNotNull(Post.fields.title).present).toBe(true)
  })

  it('takes a predicate where a boolean is wanted, which is the branchless form', () => {
    // `archived ? isNotNull(x) : isNull(x)` asked as one static question:
    // "is-archived equals what you asked for".
    const archived = Expr.input('archived', Schema.Boolean)
    const predicate = Expr.eq(Expr.isNotNull(Post.fields.title), archived)

    expect(predicate.left).toEqual(Expr.isNotNull(Post.fields.title))
    expect(predicate.right).toBe(archived)
  })

  it('asks whether text contains text', () => {
    expect(Expr.contains(Post.fields.title, Expr.input('q', Schema.String))).toEqual({
      _tag: 'Contains',
      value: Expr.field(Post.fields.title),
      search: { _tag: 'Input', key: 'q', schema: Schema.String },
    })
  })

  it('refuses to ask whether an answer is absent', () => {
    expect(() => Expr.isNull(Expr.eq(Post.fields.title, 'x'))).toThrow(
      'a predicate is already an answer',
    )
    // `contains` refuses this twice over: a predicate holds a boolean, so it
    // does not hold text either. The type check comes first, and the runtime
    // one still has to hold for callers without one.
    expect(() =>
      // @ts-expect-error a predicate is an answer, and holds no text
      Expr.contains(Expr.eq(Post.fields.title, 'x'), 'y'),
    ).toThrow('a predicate is already an answer')
  })

  it('reads the fields and inputs of a nested predicate', () => {
    const worklist = [
      Expr.eq(Post.fields.title, Expr.input('type', Schema.String)),
      Expr.eq(Expr.isNotNull(Post.fields.published), Expr.input('archived', Schema.Boolean)),
      Expr.contains(Post.fields.title, Expr.input('search', Schema.String)),
    ]

    expect(dependenciesOf(...worklist)).toEqual({
      fields: [
        { entity: 'Post', key: 'title', owner: Post.identity },
        { entity: 'Post', key: 'published', owner: Post.identity },
      ],
      inputs: ['type', 'archived', 'search'],
      operations: ['eq', 'isNotNull', 'contains'],
    })
  })

  it('checks a nested predicate against the Entity the query is from', () => {
    expect(() =>
      Query.from(Post).pipe(Query.where(Expr.eq(Expr.isNotNull(Blog.Comment.fields.body), true))),
    ).toThrow('reads Comment.body, but the query is from Post')
  })
})

describe('An interpreter can tell what it cannot run', () => {
  const everything: ReadonlyArray<Operation> = ['eq', 'isNull', 'isNotNull', 'contains']

  it('says nothing is missing when the interpreter runs it all', () => {
    const q = Query.from(Post).pipe(
      Query.where(Expr.eq(Post.fields.published, true), Expr.contains(Post.fields.title, 'a')),
    )

    expect(Query.unsupported(q, everything)).toEqual([])
  })

  it('names the operations the interpreter does not run', () => {
    const q = Query.from(Post).pipe(
      Query.where(Expr.eq(Post.fields.published, true), Expr.contains(Post.fields.title, 'a')),
    )

    expect(Query.unsupported(q, ['eq'])).toEqual(['contains'])
    expect(Query.unsupported(q, [])).toEqual(['eq', 'contains'])
  })

  it('sees an operation nested inside a comparison', () => {
    // `eq(isNotNull(x), flag)` needs both, and the outer one does not hide the inner.
    const q = Query.from(Post).pipe(Query.where(Expr.eq(Expr.isNotNull(Post.fields.title), true)))

    expect(Query.unsupported(q, ['eq'])).toEqual(['isNotNull'])
  })

  it('tells isNull and isNotNull apart, since an interpreter may have one', () => {
    const nulls = Query.from(Post).pipe(Query.where(Expr.isNull(Post.fields.title)))

    expect(Query.unsupported(nulls, ['isNotNull'])).toEqual(['isNull'])
    expect(Query.unsupported(nulls, ['isNull'])).toEqual([])
  })

  it('asks nothing of an interpreter for a query with no predicates', () => {
    expect(Query.unsupported(Query.from(Post), [])).toEqual([])
  })
})

describe('show renders a query for a person to read', () => {
  it('names a field by its Entity, and an input as a placeholder', () => {
    expect(Expr.show(Expr.eq(Post.fields.title, Expr.input('q', Schema.String)))).toBe(
      'Post.title = $q',
    )
  })

  it('renders a literal as the value it is, including null', () => {
    expect(Expr.show(Expr.eq(Post.fields.published, true))).toBe('Post.published = true')
    expect(Expr.show(Expr.eq(Post.fields.title, 'a b'))).toBe('Post.title = "a b"')
    expect(Expr.show(Expr.eq(Post.fields.title, null as never))).toBe('Post.title = null')
  })

  it('says which way a null test runs, since one node covers both', () => {
    expect(Expr.show(Expr.isNull(Post.fields.title))).toBe('Post.title is null')
    expect(Expr.show(Expr.isNotNull(Post.fields.title))).toBe('Post.title is not null')
  })

  it('names contains rather than borrowing a dialect that would mean something else', () => {
    // `like` would be a lie: this is case-insensitive with no wildcards, which
    // no backend's `like` is by default.
    expect(Expr.show(Expr.contains(Post.fields.title, 'ab'))).toBe('contains(Post.title, "ab")')
  })

  it('parenthesises a predicate standing where a value is wanted', () => {
    // Without them `Post.title is not null = $flag` reads as three operands and
    // is two.
    const nested = Expr.eq(Expr.isNotNull(Post.fields.title), Expr.input('flag', Schema.Boolean))

    expect(Expr.show(nested)).toBe('(Post.title is not null) = $flag')
  })

  it('renders a whole query clause by clause', () => {
    const q = Query.from(Post).pipe(
      Query.where(Expr.eq(Post.fields.published, true)),
      Query.where(Expr.contains(Post.fields.title, Expr.input('q', Schema.String))),
      Query.orderBy(Order.desc(Post.fields.title), Order.asc(Post.fields.id)),
    )

    expect(Query.show(q)).toBe(
      [
        'FROM Post',
        'WHERE Post.published = true',
        '  AND contains(Post.title, $q)',
        'ORDER BY Post.title DESC, Post.id ASC',
      ].join('\n'),
    )
  })

  it('omits the clauses the query does not have, rather than printing empty ones', () => {
    expect(Query.show(Query.from(Post))).toBe('FROM Post')
    expect(Query.show(Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.id))))).toBe(
      'FROM Post\nORDER BY Post.id ASC',
    )
  })
})
