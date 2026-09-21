/**
 * What a comparison accepts and refuses. The value of a typed kernel is that a
 * query comparing a title to a number is a compile error where it is written,
 * not a row that never matches.
 */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Expr, Order, dependenciesOf, type EqPredicate, type InputExpr } from '../src/index.js'
import { Blog } from './blogFixture.js'

const { Post } = Blog

// A field against a literal of its own type.
expectTypeOf(Expr.eq(Post.fields.title, 'hello')).toEqualTypeOf<EqPredicate>()
expectTypeOf(Expr.eq(Post.fields.published, true)).toEqualTypeOf<EqPredicate>()

// A field against an input of its own type.
const slug: InputExpr<string> = Expr.input('slug', Schema.String)
expectTypeOf(Expr.eq(Post.fields.title, slug)).toEqualTypeOf<EqPredicate>()

// A field carries its own value type out of the Entity's schema.
expectTypeOf(Expr.field(Post.fields.published).schema).toEqualTypeOf<
  Schema.Codec<boolean, unknown>
>()

// @ts-expect-error a title is a string, not a number
Expr.eq(Post.fields.title, 42)

// @ts-expect-error a published flag is a boolean, not a string
Expr.eq(Post.fields.published, 'yes')

// @ts-expect-error an input of the wrong type is refused like a literal of it
Expr.eq(Post.fields.title, Expr.input('count', Schema.Number))

// @ts-expect-error a relation is not a scalar: `comments` is many Comments
Expr.eq(Post.relations.comments, 'c1')

// Ordering takes a field or a scalar, and nothing else.
expectTypeOf(Order.asc(Post.fields.id).direction).toEqualTypeOf<'asc' | 'desc'>()

// @ts-expect-error ordering by a relation is not an ordering
Order.desc(Post.relations.author)

expectTypeOf(dependenciesOf(Expr.eq(Post.fields.id, 'p1')).inputs).toEqualTypeOf<
  ReadonlyArray<string>
>()
