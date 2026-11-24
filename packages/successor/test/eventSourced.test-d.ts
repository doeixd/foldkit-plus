import { Context, Effect, Result, Schema, type Scope } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  client,
  define,
  serializes,
  serve,
  type TransportOf,
} from 'foldkit-successor/event-sourced'
import { keyed } from 'foldkit-successor/block'
import { Journal, memoryCapabilities } from 'foldkit-successor/journal'
import { model as paths, plan, rows, Stamp, TodoRow, todos, type Model } from './fixtures/todos.js'

declare const model: Model
declare const target: ReturnType<typeof rows.target>
const machine = todos.open('work')
type Live = Effect.Success<typeof machine>
declare const live: Live
expectTypeOf<Effect.Services<typeof machine>>().toEqualTypeOf<Journal | Scope.Scope>()
const request = { type: 'ToggleTodo', id: 'click', expectedRevision: 1, input: { target } } as const
const dispatch = live.dispatch(request)
expectTypeOf<Effect.Services<typeof dispatch>>().toEqualTypeOf<Stamp>()
expectTypeOf<
  Extract<Effect.Success<typeof dispatch>, { kind: 'accepted' }>['events'][number]['type']
>().toEqualTypeOf<'TodoCompletionChanged'>()
expectTypeOf<
  Extract<Effect.Success<typeof dispatch>, { kind: 'rejected' }>['reason']['type']
>().toEqualTypeOf<'TodoMissing'>()

// @ts-expect-error A toggle takes a keyed child target, never a row index.
live.dispatch({ ...request, input: { index: 7 } })
// @ts-expect-error The authoritative host has to supply the journal.
Effect.runPromise(Effect.scoped(todos.open('work')))
// @ts-expect-error The authoritative toggle has to supply its live facts.
Effect.runPromise(dispatch)
// @ts-expect-error The authoritative transport must supply live facts for all its routes.
serve(live, Context.empty())
Effect.runPromise(
  serve(live, Context.make(Stamp, { allocate: Effect.succeed(6) })).dispatch(request),
)

class Link extends Context.Service<Link, TransportOf<typeof todos, Error>>()(
  'successor/test/Link',
) {}
const connected = client(Link).dispatch(request)
expectTypeOf<Effect.Services<typeof connected>>().toEqualTypeOf<Link>()
expectTypeOf<Effect.Success<typeof connected>>().toEqualTypeOf<Effect.Success<typeof dispatch>>()

const illegalDecision = {
  kind: 'accepted',
  events: [{ type: 'TodoRenamed', payload: { target, label: 'tea' } }],
} as const
plan.message({
  input: Schema.Undefined,
  emits: ['TodoCompletionChanged'],
  rejects: [],
  resolve: () => Effect.void,
  // @ts-expect-error A decision can emit only the events declared by this message.
  decide: () => illegalDecision,
})

define({
  name: 'incomplete',
  version: 1,
  state: Schema.Int,
  initial: () => 0,
  events: { Added: Schema.Int, Renamed: Schema.String },
  reasons: {},
  // @ts-expect-error The one authoritative fold must handle every persisted event.
  evolve: { Added: (state, amount) => state + amount },
})

serializes(memoryCapabilities)
// @ts-expect-error Independent writers cannot enforce one atomic revision.
serializes({ ...memoryCapabilities, isolation: 'eventual' })

rows.step({
  parent: model,
  owner: model.owner,
  target,
  input: 'done',
  update: (state, input) => Result.succeed({ state, writes: [], emitted: [input.length] }),
  // @ts-expect-error A parent reaction receives the actual child's output type.
  fold: (state, output: boolean) => ({ state, writes: [] }),
})

class RowClass extends TodoRow {}
const subclassBinding = keyed('Todos.rows', paths.rows, RowClass)
expectTypeOf(subclassBinding.child.id).toEqualTypeOf<'TodoRow'>()
expectTypeOf(subclassBinding.child.machine).toEqualTypeOf<typeof TodoRow.machine>()
