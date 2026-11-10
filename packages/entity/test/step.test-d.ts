/**
 * The data-last `step` of `Operator` and of the comparison builders, used with
 * Effect's own `pipe` and `flow`. A step builds the node the data-first call
 * builds, keeps its reads exact (an overloaded callable would lose them in
 * `pipe`), and refuses a value that does not fit its subject at the step.
 *
 * Each negative case holds one defect, so its directive can only be unused if
 * the check it tests is gone.
 */
import { Schema, flow, pipe } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  Collation,
  Entity,
  Expr,
  Query,
  Text,
  type CallExpr,
  type ComparePredicate,
  type ContainsPredicate,
  type EqPredicate,
  type InPredicate,
  type InputExpr,
  type Reads,
  type TestPredicate,
} from '../src/index.js'
import { Blog } from './blogFixture.js'

const { Author, Post } = Blog

const Task = Entity.define(
  'Task',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['open', 'closed']),
    rank: Schema.Number,
    title: Schema.String,
    done: Schema.Boolean,
    note: Schema.NullOr(Schema.String),
  }),
)

// eq: a literal, an input and a literal of a union keep reads exact.
expectTypeOf(pipe(Post.fields.title, Expr.eq.step('x'))).toEqualTypeOf<
  EqPredicate & Reads<'Post'>
>()
expectTypeOf(pipe(Task.fields.status, Expr.eq.step('open'))).toEqualTypeOf<
  EqPredicate & Reads<'Task'>
>()
const slug: InputExpr<string> = Expr.input('slug', Schema.String)
expectTypeOf(pipe(Post.fields.title, Expr.eq.step(slug))).toEqualTypeOf<
  EqPredicate & Reads<'Post'>
>()
// A predicate against a boolean field.
expectTypeOf(
  pipe(Post.fields.published, Expr.eq.step(Expr.eq(Post.fields.published, true))),
).toEqualTypeOf<EqPredicate & Reads<'Post'>>()
// Reads of the value are the node's too: a field of another Entity on the right of a step.
expectTypeOf(pipe(Post.fields.title, Expr.eq.step(Expr.field(Author.fields.name)))).toEqualTypeOf<
  EqPredicate & Reads<'Post' | 'Author'>
>()

// flow: the step's subject arrives when the flow is applied.
const isOpen = flow(Expr.eq.step('open'))
expectTypeOf(isOpen(Task.fields.status)).toEqualTypeOf<EqPredicate & Reads<'Task'>>()
expectTypeOf(flow(Expr.isNull, Expr.not)(Post.fields.title)).toExtend<Reads<'Post'>>()

// @ts-expect-error a title is text, not a number
pipe(Post.fields.title, Expr.eq.step(42))
// @ts-expect-error a published flag is a boolean, not a string
pipe(Post.fields.published, Expr.eq.step('yes'))
// @ts-expect-error a status is one of its literals
pipe(Task.fields.status, Expr.eq.step('deleted'))
// @ts-expect-error an input of numbers against text
pipe(Post.fields.title, Expr.eq.step(Expr.input('n', Schema.Number)))
// @ts-expect-error the step is applied to a field, not to a value
pipe('a', Expr.eq.step('a'))
// @ts-expect-error a step takes the value, which is one argument
Expr.eq.step()
// The data-first call keeps its arity and its wrong-value error beside a step.
// @ts-expect-error eq is two arguments; its step is the data-last form
Expr.eq(Post.fields.title)
// @ts-expect-error a title is text, not a number
Expr.eq(Post.fields.title, 42)

// Comparisons: reads exact, options accepted.
expectTypeOf(pipe(Task.fields.rank, Expr.lt.step(3))).toEqualTypeOf<
  ComparePredicate & Reads<'Task'>
>()
expectTypeOf(pipe(Task.fields.rank, Expr.lte.step(3))).toEqualTypeOf<
  ComparePredicate & Reads<'Task'>
>()
expectTypeOf(pipe(Task.fields.rank, Expr.gt.step(3))).toEqualTypeOf<
  ComparePredicate & Reads<'Task'>
>()
expectTypeOf(pipe(Task.fields.rank, Expr.gte.step(3))).toEqualTypeOf<
  ComparePredicate & Reads<'Task'>
>()
expectTypeOf(
  pipe(Post.fields.title, Expr.lt.step('m', { collation: Collation.binary })),
).toEqualTypeOf<ComparePredicate & Reads<'Post'>>()
expectTypeOf(flow(Expr.gte.step(1))(Task.fields.rank)).toEqualTypeOf<
  ComparePredicate & Reads<'Task'>
>()

// @ts-expect-error a number orders against a number, not text
pipe(Task.fields.rank, Expr.lt.step('a'))
// @ts-expect-error text orders against text, not a number
pipe(Post.fields.title, Expr.lt.step(3))
// @ts-expect-error a boolean does not order
pipe(Post.fields.published, Expr.lt.step(true))
// @ts-expect-error a predicate is an answer, not a value to order
pipe(Task.fields.rank, Expr.gt.step(Expr.eq(Task.fields.rank, 1)))
// @ts-expect-error options are a collation, not a string
pipe(Post.fields.title, Expr.lt.step('m', { collation: 'binary' }))
// @ts-expect-error a boolean does not order, whatever its step
pipe(Task.fields.done, Expr.lte.step(true))

// contains
expectTypeOf(pipe(Post.fields.title, Expr.contains.step('a'))).toEqualTypeOf<
  ContainsPredicate & Reads<'Post'>
>()
expectTypeOf(
  pipe(Task.fields.note, Expr.contains.step(Expr.input('q', Schema.String))),
).toEqualTypeOf<ContainsPredicate & Reads<'Task'>>()
expectTypeOf(flow(Expr.contains.step('a'))(Post.fields.title)).toEqualTypeOf<
  ContainsPredicate & Reads<'Post'>
>()
// @ts-expect-error a number is not text
pipe(Task.fields.rank, Expr.contains.step('a'))
// @ts-expect-error the search is text
pipe(Post.fields.title, Expr.contains.step(3))
// @ts-expect-error the search is a value or an input, not a field
pipe(Post.fields.title, Expr.contains.step(Post.fields.title))

// in
expectTypeOf(pipe(Task.fields.status, Expr.in.step(['open', 'closed']))).toEqualTypeOf<
  InPredicate & Reads<'Task'>
>()
expectTypeOf(
  pipe(Post.fields.id, Expr.in.step(Expr.input('ids', Schema.Array(Schema.String)))),
).toEqualTypeOf<InPredicate & Reads<'Post'>>()
expectTypeOf(flow(Expr.in.step(['a']))(Post.fields.id)).toEqualTypeOf<InPredicate & Reads<'Post'>>()
// @ts-expect-error a status is one of its literals
pipe(Task.fields.status, Expr.in.step(['open', 'deleted']))
// @ts-expect-error numbers against text
pipe(Post.fields.title, Expr.in.step([1, 2]))
// @ts-expect-error a list, not a single value
pipe(Post.fields.title, Expr.in.step('a'))
// @ts-expect-error an input of numbers against text
pipe(Post.fields.title, Expr.in.step(Expr.input('ns', Schema.Array(Schema.Number))))

// A cross-Entity predicate is refused where the data-first one is: at the query.
Query.from(Post).pipe(Query.where(pipe(Post.fields.title, Expr.eq.step('x'))))
// @ts-expect-error a predicate over Author does not belong to a query from Post
Query.from(Post).pipe(Query.where(pipe(Author.fields.name, Expr.eq.step('x'))))

// An operator's step: the arguments past the first, then the first.
expectTypeOf(pipe(Post.fields.title, Text.startsWith.step('a'))).toExtend<
  TestPredicate & Reads<'Post'>
>()
expectTypeOf(pipe(Post.fields.title, Text.startsWith.step('a'))).toEqualTypeOf<
  TestPredicate & Reads<'Post'>
>()
Query.from(Post).pipe(Query.where(pipe(Post.fields.title, Text.startsWith.step('a'))))
// @ts-expect-error a predicate over Author does not belong to a query from Post
Query.from(Post).pipe(Query.where(pipe(Author.fields.name, Text.startsWith.step('a'))))
// @ts-expect-error the prefix is text
pipe(Post.fields.title, Text.startsWith.step(3))
// @ts-expect-error the subject is text
pipe(Task.fields.rank, Text.startsWith.step('a'))
// @ts-expect-error startsWith has one argument past the first
Text.startsWith.step()
// @ts-expect-error startsWith has one argument past the first
Text.startsWith.step('a', 'b')
// @ts-expect-error a step takes no options; a call that needs a collation is data-first
Text.startsWith.step('a', { collation: Collation.binary })

const trim = Expr.operator('acme.trim', {
  input: [Schema.String],
  output: Schema.String,
  definedAs: text => text,
})
const lower = Expr.operator('acme.lower', {
  input: [Schema.String],
  output: Schema.String,
  definedAs: text => text,
})
const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  definedAs: (a, b) => a,
})
// A unary operator's step takes nothing, and chains in flow and pipe with reads exact.
expectTypeOf(pipe(Post.fields.title, trim.step(), lower.step())).toExtend<
  CallExpr<string> & Reads<'Post'>
>()
expectTypeOf(flow(trim.step(), lower.step())(Post.fields.title)).toEqualTypeOf<
  CallExpr<string> & Reads<'Post'>
>()
expectTypeOf(flow(trim.step(), concat.step('-'))(Post.fields.title)).toEqualTypeOf<
  CallExpr<string> & Reads<'Post'>
>()
// A step given a field of another Entity reads both.
expectTypeOf(pipe(Post.fields.title, concat.step(Expr.field(Author.fields.name)))).toEqualTypeOf<
  CallExpr<string> & Reads<'Post' | 'Author'>
>()
// @ts-expect-error a unary operator's step takes no argument
trim.step('a')
// @ts-expect-error trim takes text, not a number
pipe(Task.fields.rank, trim.step())
