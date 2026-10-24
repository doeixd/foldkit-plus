/**
 * What a comparison accepts and refuses. The value of a typed kernel is that a
 * query comparing a title to a number is a compile error where it is written,
 * not a row that never matches.
 */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  Collation,
  Entity,
  Expr,
  Order,
  Query,
  Write,
  dependenciesOf,
  type WriteCondition,
  type AndPredicate,
  type ComparePredicate,
  type EqPredicate,
  type InPredicate,
  type NotPredicate,
  type OrPredicate,
  type InputExpr,
  type Predicate,
  type Reads,
} from '../src/index.js'
import { Blog } from './blogFixture.js'

const { Post } = Blog

// A field against a literal of its own type.
expectTypeOf(Expr.eq(Post.fields.title, 'hello')).toEqualTypeOf<EqPredicate & Reads<'Post'>>()
expectTypeOf(Expr.eq(Post.fields.published, true)).toEqualTypeOf<EqPredicate & Reads<'Post'>>()

// A field against an input of its own type.
const slug: InputExpr<string> = Expr.input('slug', Schema.String)
expectTypeOf(Expr.eq(Post.fields.title, slug)).toEqualTypeOf<EqPredicate & Reads<'Post'>>()

// A field carries its own value type out of the Entity's schema.
expectTypeOf(Expr.field(Post.fields.published).schema).toEqualTypeOf<
  Schema.Codec<boolean, unknown>
>()

// @ts-expect-error a title is a string, not a number
Expr.eq(Post.fields.title, 42)

// A plain value on the left: the right side is typed from the left, and the
// error names the order rather than calling 3 a bad operand.
// @ts-expect-error the field goes on the left
Expr.eq(3, Post.fields.title)
// @ts-expect-error a value on the left is refused against another value too
Expr.eq('a', 'a')

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

// A chosen order maps every name its sort can hold to a field.
const sortBy = Expr.input(
  'sort',
  Schema.NullOr(
    Schema.Struct({
      by: Schema.Literals(['title', 'id']),
      direction: Schema.Literals(['asc', 'desc']),
    }),
  ),
)
Order.chosen(sortBy, { title: Post.fields.title, id: Post.fields.id })
// @ts-expect-error a name the sort can hold, `id`, has no field
Order.chosen(sortBy, { title: Post.fields.title })

// ---------------------------------------------------------------------------
// `in` takes a list of what the value holds
// ---------------------------------------------------------------------------

expectTypeOf(Expr.in(Doc.fields.rank, [1, 2])).toEqualTypeOf<InPredicate & Reads<'Doc'>>()
expectTypeOf(
  Expr.in(Doc.fields.title, Expr.input('titles', Schema.Array(Schema.String))),
).toEqualTypeOf<InPredicate & Reads<'Doc'>>()

// @ts-expect-error a rank is a number, so its list holds numbers
Expr.in(Doc.fields.rank, ['1'])

// @ts-expect-error an input of the wrong element type
Expr.in(Doc.fields.rank, Expr.input('titles', Schema.Array(Schema.String)))

// @ts-expect-error one value is not a list
Expr.in(Doc.fields.rank, 1)

// and, or and not take predicates, and need at least one.
const titled = Expr.eq(Post.fields.title, 'hello')
const live = Expr.eq(Post.fields.published, true)
expectTypeOf(Expr.or(titled, live)).toEqualTypeOf<OrPredicate & Reads<'Post'>>()
expectTypeOf(Expr.and(titled, live)).toEqualTypeOf<AndPredicate & Reads<'Post'>>()
expectTypeOf(Expr.not(titled)).toEqualTypeOf<NotPredicate & Reads<'Post'>>()
// One operand is that operand, typed as itself.
expectTypeOf(Expr.or(titled)).toEqualTypeOf<EqPredicate & Reads<'Post'>>()
// A list known non-empty spreads in; its result is some predicate.
declare const terms: readonly [Predicate, ...Array<Predicate>]
expectTypeOf(Expr.or(...terms)).toEqualTypeOf<Predicate>()
declare const maybeNone: ReadonlyArray<Predicate>
// @ts-expect-error a list that may be empty would match no row
Expr.or(...maybeNone)
// @ts-expect-error an or of nothing
Expr.or()
// @ts-expect-error a field is a value, not a predicate: compare it with eq first
Expr.and(titled, Post.fields.published)
// @ts-expect-error not of a value is not a question
Expr.not(Post.fields.published)

// whenGiven hands the predicate its input as never null, which eq requires.
const chosen = Expr.input('title', Schema.NullOr(Schema.String))
expectTypeOf(Expr.whenGiven(chosen, title => Expr.eq(Post.fields.title, title))).toEqualTypeOf<
  Predicate & Reads<'Post'>
>()
// @ts-expect-error without it, a nullable input against a field that is never null
Expr.eq(Post.fields.title, chosen)

// A comparison orders numbers, text and dates, typed like eq on its other side.
expectTypeOf(Expr.lt(Post.fields.title, 'm', { collation: Collation.binary })).toEqualTypeOf<
  ComparePredicate & Reads<'Post'>
>()
// @ts-expect-error a boolean does not order
Expr.lt(Post.fields.published, true)
// @ts-expect-error the other side is of the field's type
Expr.lt(Post.fields.title, 3)
// @ts-expect-error a predicate is an answer, not a value to order
Expr.lt(Expr.eq(Post.fields.title, 'x'), 'y')

// ---------------------------------------------------------------------------
// A predicate names the Entities it reads, so `where` refuses another's
// ---------------------------------------------------------------------------

Query.from(Post).pipe(Query.where(Expr.eq(Post.fields.title, 'x')))
Query.from(Post).pipe(
  // @ts-expect-error a Doc field in a query from Post
  Query.where(Expr.eq(Doc.fields.title, 'x')),
)
Query.from(Post).pipe(
  // @ts-expect-error however deep it sits
  Query.where(Expr.or(Expr.eq(Post.fields.title, 'x'), Expr.not(Expr.eq(Doc.fields.rank, 1)))),
)
// A predicate typed plainly reads as unknown, and is left to the run-time check.
declare const somePredicate: Predicate
Query.from(Post).pipe(Query.where(somePredicate))
// One that reads no field at all is any query's.
Query.from(Post).pipe(Query.where(Expr.isNull(Expr.input('given', Schema.NullOr(Schema.String)))))

// An ordering term too: a field of another Entity is refused where it is piped.
Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.title)))
Query.from(Post).pipe(
  // @ts-expect-error a Doc field orders no Post
  Query.orderBy(Order.desc(Doc.fields.rank)),
)

// A write's precondition reads its own Entity, typed by the input it is given.
const Retitle = Entity.input(Doc, Schema.Struct({ id: Schema.String, rank: Schema.Number }))
Write.update(Retitle, { id: 'id', when: ({ input }) => Expr.lt(Doc.fields.rank, input.rank) })
Write.update(Retitle, {
  id: 'id',
  // @ts-expect-error a Post field is no precondition of a Doc
  when: () => Expr.eq(Post.fields.title, 'x'),
})
Write.update(Retitle, {
  id: 'id',
  // @ts-expect-error the rank input is a number; a title is text
  when: ({ input }) => Expr.eq(Doc.fields.title, input.rank),
})
// An optional `when` in a variable could be none or a precondition: it picks neither overload,
// since the plain one would type a write that may be refused as unmet as one that may not.
const maybe: {
  readonly id: 'id'
  readonly when?: WriteCondition<typeof Doc, typeof Retitle.schema.fields>
} = {
  id: 'id',
}
// @ts-expect-error a `when` that may be there needs the caller to say which
Write.update(Retitle, maybe)

// An increment moves a number field by a number the input holds.
const Rerank = Entity.input(
  Doc,
  Schema.Struct({ id: Schema.String, rank: Schema.Number, by: Schema.Number, note: Schema.String }),
  { by: Entity.unmapped, note: Entity.unmapped },
)
Write.update(Rerank, { id: 'id', expect: 'rank', increment: { rank: 'by' } })
// @ts-expect-error a title is text, which no amount moves
Write.update(Rerank, { id: 'id', expect: 'rank', increment: { title: 'by' } })
// @ts-expect-error the note is text, so no amount
Write.update(Rerank, { id: 'id', expect: 'rank', increment: { rank: 'note' } })
