import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Order, Query, dependenciesOf, type Predicate } from '../src/index.js'
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
      direction: 'asc',
      expr: Expr.field(Post.fields.id),
    })
    expect(Order.desc(Expr.field(Post.fields.title)).direction).toBe('desc')
  })
})

describe('dependenciesOf says what an expression reads', () => {
  it('names the fields, the inputs, and the operations', () => {
    const predicate = Expr.eq(Post.fields.title, Expr.input('title', Schema.String))

    expect(dependenciesOf(predicate)).toEqual({
      fields: [{ entity: 'Post', key: 'title' }],
      inputs: ['title'],
      operations: ['eq'],
    })
  })

  it('counts a field once however often it is read', () => {
    const left = Expr.eq(Post.fields.id, 'p1')
    const right = Expr.eq(Post.fields.id, Expr.input('id', Schema.String))

    expect(dependenciesOf(left, right).fields).toEqual([{ entity: 'Post', key: 'id' }])
  })

  it('reads an ordering term as well as a predicate', () => {
    const found = dependenciesOf(
      Expr.eq(Post.fields.published, true),
      Order.desc(Post.fields.title),
      Order.asc(Post.fields.id),
    )

    expect(found.fields).toEqual([
      { entity: 'Post', key: 'published' },
      { entity: 'Post', key: 'title' },
      { entity: 'Post', key: 'id' },
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
        { entity: 'Post', key: 'title' },
        { entity: 'Post', key: 'id' },
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

  it('drops what a fragment added only when asked, explicitly', () => {
    const narrowed = Query.from(Post).pipe(
      Query.where(published),
      Query.orderBy(Order.asc(Post.fields.id)),
    )

    expect(Query.unfiltered(narrowed).where).toEqual([])
    expect(Query.unfiltered(narrowed).orderBy).toEqual(narrowed.orderBy)
    expect(Query.unordered(narrowed).orderBy).toEqual([])
    expect(Query.unordered(narrowed).where).toEqual(narrowed.where)
  })

  it('reuses a fragment across queries over the same Entity', () => {
    const onlyPublished = Query.where(published)
    const newest = Query.orderBy(Order.desc(Post.fields.title))

    const list = Query.from(Post).pipe(onlyPublished, newest)
    const one = Query.from(Post).pipe(onlyPublished, Query.where(byTitle))

    expect(list.where).toEqual([published])
    expect(one.where).toEqual([published, byTitle])
  })

  it('says what the whole query reads, predicates and ordering together', () => {
    const q = Query.from(Post).pipe(Query.where(byTitle), Query.orderBy(Order.asc(Post.fields.id)))

    expect(Query.dependencies(q)).toEqual({
      fields: [
        { entity: 'Post', key: 'title' },
        { entity: 'Post', key: 'id' },
      ],
      inputs: ['title'],
      operations: ['eq'],
    })
  })

  it('recognises one, and nothing else', () => {
    expect(Query.is(Query.from(Post))).toBe(true)
    expect(Query.is(published)).toBe(false)
    expect(Query.is(undefined)).toBe(false)
  })
})

describe('Query refuses what it could not answer', () => {
  const Comment = Blog.Comment

  it('refuses a predicate over an Entity it is not from', () => {
    expect(() => Query.from(Post).pipe(Query.where(Expr.eq(Comment.fields.body, 'x')))).toThrow(
      '[foldkit-entity] Query.where: a predicate reads Comment.body, but the query is from Post',
    )
  })

  it('refuses an ordering over an Entity it is not from', () => {
    expect(() => Query.from(Post).pipe(Query.orderBy(Order.asc(Comment.fields.id)))).toThrow(
      '[foldkit-entity] Query.orderBy: a term reads Comment.id, but the query is from Post',
    )
  })

  it('refuses another Entity of the same name, which is not the same Entity', () => {
    const Other = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))

    expect(() => Query.from(Post).pipe(Query.where(Expr.eq(Other.fields.title, 'x')))).toThrow(
      'but the query is from Post',
    )
  })

  it('takes a predicate with no field at all', () => {
    expect(() => Query.from(Post).pipe(Query.where(Expr.eq(Expr.literal(1), 1)))).not.toThrow()
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
    expect(() => Expr.contains(Expr.eq(Post.fields.title, 'x'), 'y')).toThrow(
      'a predicate is already an answer',
    )
  })

  it('reads the fields and inputs of a nested predicate', () => {
    const worklist = [
      Expr.eq(Post.fields.title, Expr.input('type', Schema.String)),
      Expr.eq(Expr.isNotNull(Post.fields.published), Expr.input('archived', Schema.Boolean)),
      Expr.contains(Post.fields.title, Expr.input('search', Schema.String)),
    ]

    expect(dependenciesOf(...worklist)).toEqual({
      fields: [
        { entity: 'Post', key: 'title' },
        { entity: 'Post', key: 'published' },
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
