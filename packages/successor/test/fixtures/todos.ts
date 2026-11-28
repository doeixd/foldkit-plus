import { Context, Effect, Option, Result, Schema } from 'effect'
import { Bool, Expr, Num, Path, Transition } from '@doeixd/metakit'
import * as Rows from '@doeixd/metakit/aggregates'
import * as Machine from '@doeixd/metakit/machine'
import {
  keySegment,
  keyed,
  make,
  targetSchema,
  type ChildStep,
  type Observed,
  type Target,
} from 'foldkit-successor/block'
import { define } from 'foldkit-successor/event-sourced'
import type { WireCommit } from 'foldkit-successor/journal'

const Row = Schema.Struct({ label: Schema.String, done: Schema.Boolean })
type Row = typeof Row.Type
const Children = Schema.Record(
  Schema.String,
  Schema.Struct({
    incarnation: Schema.NonEmptyString,
    model: Row,
  }),
)
export const Model = Schema.Struct({
  owner: Schema.NonEmptyString,
  rows: Children,
  remaining: Schema.Int,
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type Model = typeof Model.Type

const Input = Schema.Struct({ target: targetSchema })
const Added = Schema.Struct({ key: Schema.String, label: Schema.NonEmptyString })
const Renamed = Schema.Struct({ target: targetSchema, label: Schema.NonEmptyString })
const Toggled = Schema.Struct({ target: targetSchema, done: Schema.Boolean, stamp: Schema.Int })
const Removed = Schema.Struct({ target: targetSchema })
const Reasons = { TodoMissing: targetSchema, TodoExists: Schema.String }
const Events = {
  TodoAdded: Added,
  TodoRenamed: Renamed,
  TodoCompletionChanged: Toggled,
  TodoRemoved: Removed,
}

export const model = Path.forSchema(Model)
export const incomplete = Rows.count(Row, row => Bool.not(row.done))
export const freshCount = (state: Model): number =>
  incomplete.evaluate(Object.values(state.rows).map(row => row.model))
export const invariant = (state: Model): boolean => state.remaining === freshCount(state)

export const initial = (owner: string): Model => ({
  owner,
  rows: {
    [keySegment('7')]: { incarnation: '1', model: { label: 'Buy tea', done: false } },
    [keySegment('8')]: { incarnation: '2', model: { label: 'Wash cup', done: false } },
  },
  remaining: 2,
  generation: 2,
})

export const target = (state: Model, key: string): Target =>
  rows.target(state.owner, key, Option.getOrThrow(rows.get(state, key)))

const toggleRow = Transition.make({
  state: Row,
  input: Schema.Undefined,
  apply: ({ state }) => [Transition.set(state.done, Bool.not(state.done))],
  emits: ({ state }) => [Transition.emit('ChangedCompletion', { done: Bool.not(state.done) })],
})
const changeDone = Transition.make({
  state: Row,
  input: Schema.Boolean,
  apply: ({ state, input }) => [Transition.set(state.done, input)],
  emits: ({ input }) => [Transition.emit('ChangedCompletion', { done: input })],
})
const rename = Transition.make({
  state: Row,
  input: Schema.String,
  apply: ({ state, input }) => [Transition.set(state.label, input)],
})
export const TodoRow = make(
  'TodoRow',
  Machine.make({
    state: Row,
    transitions: { Toggle: toggleRow, ChangeDone: changeDone, Rename: rename },
  }),
)
export const rows = keyed('Todos.rows', model.rows, TodoRow)

const completionDelta = <State>(
  done: Expr.Expr<State, boolean>,
  sign: 1 | -1,
): Expr.Expr<State, number> => Num.mul(Expr.when(done, { then: -1, else: 1 }), sign)

const parentDelta = (sign: 1 | -1) =>
  Transition.make({
    state: Model,
    input: Schema.Boolean,
    apply: ({ state, input }) => [Transition.add(state.remaining, completionDelta(input, sign))],
  })
const Todos = make(
  'Todos',
  Machine.make({
    state: Model,
    transitions: { RemainingChanged: parentDelta(1) },
  }),
)
export const countedToggle = Todos.machine.transitions.RemainingChanged
const unchanged = (state: Model): Observed<Model> => ({ state, writes: [] })
const remainingPath = model.remaining.segments

export type Maintenance = 'recompute' | 'incremental'

export const toggle = (
  parent: Model,
  target: Target,
  maintenance: Maintenance,
  delta = countedToggle,
) => {
  const fold = (candidate: Model): Observed<Model> => {
    const nextRow = Option.getOrThrow(rows.get(candidate, target.key)).model
    if (maintenance === 'incremental') {
      return Result.getOrThrow(Transition.stepObserved(delta, candidate, nextRow.done))
    }
    const remaining = freshCount(candidate)
    return {
      state: Path.set(model.remaining, candidate, remaining),
      writes: [{ kind: 'path', path: remainingPath }],
    }
  }
  return rows.step({
    owner: parent.owner,
    parent,
    target,
    input: undefined,
    update: (row, input) =>
      Transition.stepObserved(rows.child.machine.transitions.Toggle, row, input),
    fold,
  })
}

export const invertedDelta = parentDelta(-1)

export class Stamp extends Context.Service<Stamp, { readonly allocate: Effect.Effect<number> }>()(
  'foldkit/successor/test/TodoStamp',
) {}

const evolveTarget = <Input, Output, Failure>(
  parent: Model,
  target: Target,
  input: Input,
  update: (row: Row, input: Input) => Result.Result<ChildStep<Row, Output>, Failure>,
): Model =>
  Result.getOrThrow(
    rows.step({ owner: parent.owner, parent, target, input, update, fold: unchanged }),
  ).state

const migrate = (commit: WireCommit): WireCommit => {
  if (commit.version !== 1 || commit.disposition.kind !== 'accepted') {
    throw new Error(`Unexpected historical record version ${commit.version}`)
  }
  const V1 = Schema.Struct({ target: targetSchema, mark: Schema.Boolean, seq: Schema.Int })
  return {
    ...commit,
    version: 2,
    disposition: {
      ...commit.disposition,
      events: commit.disposition.events.map(event => {
        if (event.type !== 'TodoCompletionChanged') return event
        const old = Schema.decodeUnknownSync(V1)(event.payload)
        return { type: event.type, payload: { target: old.target, done: old.mark, stamp: old.seq } }
      }),
    },
  }
}

export const remove = (parent: Model, at: Target): Model => {
  const row = Option.getOrThrow(rows.get(parent, at.key))
  if (at.owner !== parent.owner || at.binding !== rows.id || at.incarnation !== row.incarnation) {
    throw new Error('An event targeted a stale Todo')
  }
  const nextRows = { ...parent.rows }
  delete nextRows[keySegment(at.key)]
  return { ...parent, rows: nextRows, remaining: parent.remaining - Number(!row.model.done) }
}

export const plan = define({
  name: Todos.id,
  version: 2,
  state: Model,
  initial,
  events: Events,
  reasons: Reasons,
  migrate,
  evolve: {
    TodoAdded: (parent, { key, label }) => {
      const generation = parent.generation + 1
      return {
        ...parent,
        generation,
        rows: {
          ...parent.rows,
          [keySegment(key)]: { incarnation: String(generation), model: { label, done: false } },
        },
        remaining: parent.remaining + 1,
      }
    },
    TodoRenamed: (parent, { target, label }) =>
      evolveTarget(parent, target, label, (row, input) =>
        Transition.stepObserved(rows.child.machine.transitions.Rename, row, input),
      ),
    TodoCompletionChanged: (parent, event) => {
      const next = evolveTarget(parent, event.target, event.done, (row, input) =>
        Transition.stepObserved(rows.child.machine.transitions.ChangeDone, row, input),
      )
      if (next === parent) return parent
      const before = Option.getOrThrow(rows.get(parent, event.target.key)).model
      const after = Option.getOrThrow(rows.get(next, event.target.key)).model
      return Path.set(
        model.remaining,
        next,
        incomplete.replaceTotal(parent.remaining, before, after),
      )
    },
    TodoRemoved: (parent, { target }) => remove(parent, target),
  },
})

const has = (state: Model, target: Target): boolean =>
  state.owner === target.owner &&
  rows.id === target.binding &&
  Option.exists(rows.get(state, target.key), row => row.incarnation === target.incarnation)

export const toggleMessage = plan.message({
  input: Input,
  emits: ['TodoCompletionChanged'],
  rejects: ['TodoMissing'],
  resolve: () => Effect.flatMap(Stamp, stamp => stamp.allocate),
  decide: (parent, { target }, stamp) =>
    Result.match(toggle(parent, target, 'recompute'), {
      onFailure: () => ({ kind: 'rejected', reason: { type: 'TodoMissing', payload: target } }),
      onSuccess: ({ emitted }) => ({
        kind: 'accepted',
        events: emitted.map(({ done }) => ({
          type: 'TodoCompletionChanged',
          payload: { target, done, stamp },
        })),
        commands: [{ type: 'NotifyCompletion', payload: { target, stamp } }],
      }),
    }),
})

export const todos = plan.run({
  ToggleTodo: toggleMessage,
  AddTodo: plan.message({
    input: Added,
    emits: ['TodoAdded'],
    rejects: ['TodoExists'],
    resolve: () => Effect.void,
    decide: (parent, input) =>
      Option.isSome(rows.get(parent, input.key))
        ? { kind: 'rejected', reason: { type: 'TodoExists', payload: input.key } }
        : { kind: 'accepted', events: [{ type: 'TodoAdded', payload: input }] },
  }),
  RenameTodo: plan.message({
    input: Renamed,
    emits: ['TodoRenamed'],
    rejects: ['TodoMissing'],
    resolve: () => Effect.void,
    decide: (parent, input) =>
      has(parent, input.target)
        ? { kind: 'accepted', events: [{ type: 'TodoRenamed', payload: input }] }
        : { kind: 'rejected', reason: { type: 'TodoMissing', payload: input.target } },
  }),
  RemoveTodo: plan.message({
    input: Input,
    emits: ['TodoRemoved'],
    rejects: ['TodoMissing'],
    resolve: () => Effect.void,
    decide: (parent, input) =>
      has(parent, input.target)
        ? { kind: 'accepted', events: [{ type: 'TodoRemoved', payload: input }] }
        : { kind: 'rejected', reason: { type: 'TodoMissing', payload: input.target } },
  }),
})
