import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Order, dependenciesOf, type Predicate } from '../src/index.js'
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
