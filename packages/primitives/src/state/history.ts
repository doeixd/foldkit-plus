/**
 * Undo/redo as a bundle factory: the past, present, and future of one value
 * live in the Model, so every step replays. Pushing records, even an unchanged
 * value; skipping duplicates is the application's policy, not the stack's.
 *
 * A push may name a `group`. Consecutive pushes of the same group are one step:
 * the present moves and nothing new is recorded, so typing a word undoes as a
 * whole. Grouping needs no clock; the application names what belongs together.
 *
 * The steps are also pure functions (`History.push`, `undo`, `redo`, `goTo`, `clear`),
 * for a parent that records an edit in the same transition that makes it
 * rather than dispatching a Message to a placed bundle.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'

export const HistoryModel = <Value>(value: Schema.Codec<Value, unknown>) =>
  Schema.Struct({
    past: Schema.Array(value),
    present: value,
    future: Schema.Array(value),
    /** The group of the last push, so the next push of the same group joins it; `null` for none. */
    group: Schema.NullOr(Schema.String),
  })
export type HistoryModel<Value> = {
  readonly past: ReadonlyArray<Value>
  readonly present: Value
  readonly future: ReadonlyArray<Value>
  readonly group: string | null
}

const start = <Value>(present: Value): HistoryModel<Value> => ({
  past: [],
  present,
  future: [],
  group: null,
})

/**
 * No redo steps, keeping an already empty future: a view that reads the
 * future compares it by identity, so a push per keystroke or stroke cell
 * must not hand it a new empty array each time.
 */
const noFuture = <Value>(model: HistoryModel<Value>): ReadonlyArray<Value> =>
  model.future.length === 0 ? model.future : []

const push = <Value>(
  model: HistoryModel<Value>,
  value: Value,
  options: { readonly capacity: number; readonly group?: string | null | undefined },
): HistoryModel<Value> => {
  const group = options.group ?? null
  // The same group again joins the last step: the present moves, the past stays.
  if (group !== null && group === model.group && model.past.length > 0)
    return { ...model, present: value, future: noFuture(model) }
  return {
    // slice(-0) is slice(0): a zero capacity keeps nothing, explicitly.
    past: options.capacity === 0 ? [] : [...model.past, model.present].slice(-options.capacity),
    present: value,
    future: noFuture(model),
    group,
  }
}

const undo = <Value>(model: HistoryModel<Value>): HistoryModel<Value> => {
  const previous = model.past[model.past.length - 1]
  if (previous === undefined) return model
  return {
    past: model.past.slice(0, -1),
    present: previous,
    future: [model.present, ...model.future],
    group: null,
  }
}

const redo = <Value>(model: HistoryModel<Value>): HistoryModel<Value> => {
  const next = model.future[0]
  if (next === undefined) return model
  return {
    past: [...model.past, model.present],
    present: next,
    future: model.future.slice(1),
    group: null,
  }
}

const goTo = <Value>(model: HistoryModel<Value>, step: number): HistoryModel<Value> => {
  const steps = [...model.past, model.present, ...model.future]
  if (!Number.isInteger(step) || step < 0 || step >= steps.length || step === model.past.length)
    return model
  return {
    past: steps.slice(0, step),
    present: steps[step]!,
    future: steps.slice(step + 1),
    group: null,
  }
}

const clear = <Value>(model: HistoryModel<Value>): HistoryModel<Value> =>
  model.past.length === 0 && model.future.length === 0 && model.group === null
    ? model
    : start(model.present)

const close = <Value>(model: HistoryModel<Value>): HistoryModel<Value> =>
  model.group === null ? model : { ...model, group: null }

const revert = <Value>(model: HistoryModel<Value>, group: string): HistoryModel<Value> =>
  // The group is ended even where there is nothing to take back (capacity 0).
  model.group === group ? { ...undo(model), future: [], group: null } : model

const checkCapacity = (name: string, capacity: number): number => {
  // A negative or fractional capacity would silently keep a wrong-sized past;
  // fail where it is given, naming the caller, instead.
  if (!Number.isInteger(capacity) || capacity < 0)
    throw new Error(`History "${name}": capacity must be a non-negative integer`)
  return capacity
}

/** Whether Undo would move: the past is non-empty. */
export const canUndo = <Value>(model: HistoryModel<Value>): boolean => model.past.length > 0

/** Whether Redo would move: the future is non-empty. */
export const canRedo = <Value>(model: HistoryModel<Value>): boolean => model.future.length > 0

/** The steps of a history as pure functions of its Model. */
export const History = {
  /** A history whose present is `value`, with nothing to undo. */
  start,
  /** Records `value` as the present; the same `group` as the last push joins its step. */
  push,
  /** One step back, or the Model as it was when there is none. */
  undo,
  /** One step forward, or the Model as it was when there is none. */
  redo,
  /**
   * The value at `step` made the present, counting every kept value from the
   * oldest (0), so the present is at `past.length`: what a click on a step's
   * thumbnail does. The Model as it was for the present or a step not kept.
   */
  goTo,
  /** Nothing to undo or redo, the present kept. */
  clear,
  /** The next push starts a step of its own, whatever its group: a group ends here. */
  close,
  /**
   * The step `group` is making taken back, and not redoable: what a cancelled
   * edit, or one that ended where it began, leaves. The Model as it was when
   * the last push was not of `group`. What the group's first push dropped
   * stays dropped: the redo future it cleared, and an entry capacity evicted;
   * with a capacity of 0 nothing was kept, so the present stays and only the
   * group ends.
   */
  revert,
  canUndo,
  canRedo,
}

export const history = <const Name extends string, Value>(config: {
  readonly name: Name
  readonly value: Schema.Codec<Value, unknown>
  readonly capacity?: number | undefined
}) => {
  const capacity = checkCapacity(config.name, config.capacity ?? 100)
  const Model = HistoryModel(config.value)
  const Message = defineMessageUnion({
    Push: { value: config.value, group: Schema.optional(Schema.String) },
    Undo: {},
    Redo: {},
    GoTo: { step: Schema.Number },
    Clear: {},
  })
  return Object.assign(
    Bundle.make(config.name, {
      Model,
      Message,
      args: Schema.Struct({ initial: config.value }),
      init: args => ({ model: start(args.initial) }),
      update: (model, message) =>
        Message.match(message, {
          Push: ({ value, group }) => ({ model: push(model, value, { capacity, group }) }),
          Undo: () => ({ model: undo(model) }),
          Redo: () => ({ model: redo(model) }),
          GoTo: ({ step }) => ({ model: goTo(model, step) }),
          Clear: () => ({ model: clear(model) }),
        }),
    }),
    // The union object is both the Message codec and its constructors, so a
    // placement dispatches `EditHistory.Message.Push(...)` like any bundle's
    // exported Message.
    { Message },
  )
}
