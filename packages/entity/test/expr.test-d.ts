/**
 * What a comparison accepts and refuses. The value of a typed kernel is that a
 * query comparing a title to a number is a compile error where it is written,
 * not a row that never matches.
 */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  Entity,
  Expr,
  Order,
  Query,
  dependenciesOf,
  type EqPredicate,
  type InputExpr,
  type Predicate,
} from '../src/index.js'
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

// A Query keeps the Entity it is over, so a fragment cannot be piped into a
// query over a different one.
const posts = Query.from(Post)
expectTypeOf(posts).toEqualTypeOf<Query<typeof Post>>()
expectTypeOf(posts.pipe(Query.where(Expr.eq(Post.fields.published, true)))).toEqualTypeOf<
  Query<typeof Post>
>()

expectTypeOf(posts.entity).toEqualTypeOf<typeof Post>()
expectTypeOf(posts.where).toEqualTypeOf<ReadonlyArray<Predicate>>()

// @ts-expect-error a predicate is not an ordering term
Query.from(Post).pipe(Query.orderBy(Expr.eq(Post.fields.published, true)))

// @ts-expect-error an ordering term is not a predicate
Query.from(Post).pipe(Query.where(Order.asc(Post.fields.id)))

// @ts-expect-error `from` takes an Entity, not one of its fields
Query.from(Post.fields.title)

// ---------------------------------------------------------------------------
// `contains` searches text, and only text
// ---------------------------------------------------------------------------
// It compiles to `lower(column) like lower(?)`. Over a number that is nonsense
// which reaches the database — SQLite coerces and answers something, Postgres
// raises — so the operand is checked here instead.

const Doc = Entity.define(
  'Doc',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    subtitle: Schema.NullOr(Schema.String),
    rank: Schema.Number,
    archived: Schema.Boolean,
  }),
)

// Text, which is the whole point.
Expr.contains(Doc.fields.title, 'a')
Expr.contains(Doc.fields.title, Expr.input('q', Schema.String))

// A nullable text column is allowed, and is a documented case rather than an
// oversight: a null contains nothing, not even the empty string, so its rows
// drop out of a search that would otherwise match everything.
Expr.contains(Doc.fields.subtitle, 'a')

// A scalar already built from a field is still text.
Expr.contains(Expr.field(Doc.fields.title), 'a')

// @ts-expect-error a number holds no text
Expr.contains(Doc.fields.rank, 'a')

// @ts-expect-error a boolean holds no text
Expr.contains(Doc.fields.archived, 'a')

// @ts-expect-error a predicate holds a boolean, so it holds no text either
Expr.contains(Expr.isNull(Doc.fields.subtitle), 'a')

// The other operators are deliberately not constrained this way: absence is a
// question about a field of any type.
Expr.isNull(Doc.fields.rank)
Expr.isNotNull(Doc.fields.archived)
Expr.eq(Doc.fields.rank, 3)
