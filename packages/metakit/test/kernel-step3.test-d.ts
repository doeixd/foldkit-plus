/**
 * The types step 3 adds: a list fold's arrow typed by the list's element, a
 * write typed by its way of writing, a patch that names only the element's
 * fields, the records a transition emits, and `Transition.commutes` over two
 * transitions of one state.
 */
import { Result, Schema } from 'effect'
import {
  Arr,
  Bool,
  Expr,
  Path as PathOf,
  Transition,
  foldProperties,
  type Path,
  type Verdict,
} from '@doeixd/metakit'
import * as Relation from '@doeixd/metakit/relation'

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const holds = <T extends true>(): T => true as T

const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
  note: Schema.OptionFromNullOr(Schema.String),
})
type Todo = typeof Todo.Type
const Model = Schema.Struct({ todos: Schema.Array(Todo), maybe: Schema.NullOr(Schema.Array(Todo)) })
const ById = Schema.Struct({ id: Schema.String, title: Schema.String })

// A fold's arrow is given a path for the list's element.
Expr.in({ state: Model }, ({ state }) =>
  Arr.any(state.todos, todo => {
    holds<Equals<typeof todo.done, Path.PathAccessor<{ readonly each: Todo }, boolean>>>()
    // @ts-expect-error a todo has no field `nope`
    void todo.nope
    return todo.done
  }),
)

// What a fold gives follows the list: null where the list may be.
const { state: model } = PathOf.forEnv({ state: Model })
const folds = {
  any: Arr.any(model.todos, todo => todo.done),
  anyOfMaybe: Arr.any(model.maybe, todo => todo.done),
  count: Arr.count(model.todos, todo => todo.done),
  sum: Arr.sum(model.todos, () => 1),
  min: Arr.min(model.todos, () => 1),
  found: Arr.find(model.todos, todo => todo.done),
  title: Arr.find(
    model.todos,
    todo => todo.done,
    todo => todo.title,
  ),
  kept: Arr.keep(model.todos, todo => todo.done),
}
type Out<E> = E extends Expr.Expr<never, infer A> ? A : never
holds<Equals<Out<typeof folds.any>, boolean>>()
holds<Equals<Out<typeof folds.anyOfMaybe>, boolean | null>>()
holds<Equals<Out<typeof folds.count>, number>>()
holds<Equals<Out<typeof folds.sum>, number>>()
holds<Equals<Out<typeof folds.min>, number | null>>()
holds<Equals<Out<typeof folds.found>, Todo | null>>()
holds<Equals<Out<typeof folds.title>, string | null>>()
holds<Equals<Out<typeof folds.kept>, ReadonlyArray<Todo>>>()

// A test must be a boolean.
// @ts-expect-error a test is a boolean, not text
Expr.in({ state: Model }, ({ state }) => Arr.any(state.todos, todo => todo.title))

// A write is typed by its way of writing.
const Toggled = Transition.make({
  state: Model,
  input: ById,
  apply: ({ state, input }) => {
    const toggled = Transition.patch(state.todos, input.id, todo => ({ done: Bool.not(todo.done) }))
    holds<Equals<typeof toggled.way._tag, 'patch'>>()
    const removed = Transition.remove(state.todos, input.id)
    holds<Equals<typeof removed.way._tag, 'remove'>>()
    return [toggled]
  },
  emits: ({ input }) => [
    Transition.emit('Toggled', { id: input.id }),
    Transition.emit('Named', { title: input.title, again: 1 }, { when: true }),
  ],
})

// A patch names only the element's fields, each by its type; an Option field takes the value or null.
Transition.make({
  state: Model,
  input: ById,
  apply: ({ state, input }) => [
    Transition.patch(state.todos, input.id, () => ({ note: null })),
    // @ts-expect-error a todo has no field `nope`
    Transition.patch(state.todos, input.id, () => ({ nope: true })),
  ],
})
Transition.make({
  state: Model,
  input: ById,
  apply: ({ state, input }) => [
    // @ts-expect-error `done` is a boolean
    Transition.patch(state.todos, input.id, () => ({ done: input.title })),
  ],
})
Transition.make({
  state: Model,
  input: ById,
  apply: ({ state, input }) => [
    // @ts-expect-error the key is a todo's id, a string
    Transition.remove(state.todos, 1),
    Transition.insert(state.todos, { id: input.id, title: 't', done: false, note: null }),
  ],
})

// The records a step emits are the union of the entries' records.
const stepped = Transition.step(Toggled, { todos: [], maybe: null }, { id: 'a', title: 't' })
type Emitted = Result.Result.Success<typeof stepped>['emitted'][number]
holds<
  Equals<
    Emitted,
    | ({ readonly _tag: 'Toggled' } & { readonly id: string })
    | ({ readonly _tag: 'Named' } & { readonly title: string; readonly again: 1 })
  >
>()

// `commutes` takes two transitions of one state and answers a verdict.
const Other = Transition.make({
  state: Schema.Struct({ n: Schema.Int }),
  input: ById,
  apply: () => [],
})
const verdict = Transition.commutes(Toggled, Toggled)
holds<Equals<typeof verdict, Verdict.Verdict<never>>>()
// @ts-expect-error the two change different states
void Transition.commutes(Toggled, Other)

// A relation's arrow is given a path for the pointing row.
const Line = Schema.Struct({ amount: Schema.Int, open: Schema.Boolean })
const Lines = Relation.make('Line.owner', Line)
Expr.in({ row: Schema.Struct({ id: Schema.String }) }, ({ row }) =>
  Relation.sum(row, Lines, line => {
    holds<
      Equals<typeof line.amount, Path.PathAccessor<{ readonly each: typeof Line.Type }, number>>
    >()
    return line.amount
  }),
)

// A fold's row is keyed by the closed set of folds.
// @ts-expect-error no fold is named `median`
void foldProperties.median
