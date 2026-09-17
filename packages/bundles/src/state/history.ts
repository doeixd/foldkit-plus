/**
 * Undo/redo as a bundle factory: the past, present, and future of one value
 * live in the Model, so every step replays. Pushing records, even an unchanged
 * value; skipping duplicates is the application's policy, not the stack's.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'

export const HistoryModel = <Value>(value: Schema.Codec<Value, unknown>) =>
  Schema.Struct({
    past: Schema.Array(value),
    present: value,
    future: Schema.Array(value),
  })
export type HistoryModel<Value> = {
  readonly past: ReadonlyArray<Value>
  readonly present: Value
  readonly future: ReadonlyArray<Value>
}

export const history = <const Name extends string, Value>(config: {
  readonly name: Name
  readonly value: Schema.Codec<Value, unknown>
  readonly capacity?: number | undefined
}) => {
  const capacity = config.capacity ?? 100
  // A negative or fractional capacity would silently keep a wrong-sized past;
  // fail at the factory, naming the caller, instead.
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new Error(`History "${config.name}": capacity must be a non-negative integer`)
  }
  const Model = HistoryModel(config.value)
  const Message = defineMessageUnion({
    Push: { value: config.value },
    Undo: {},
    Redo: {},
    Clear: {},
  })
  return Object.assign(
    Bundle.make(config.name, {
      Model,
      Message,
      args: Schema.Struct({ initial: config.value }),
      init: args => ({ model: { past: [], present: args.initial, future: [] } }),
      update: (model, message) =>
        Message.match(message, {
          Push: ({ value }) => ({
            model: {
              // slice(-0) is slice(0): a zero capacity keeps nothing, explicitly.
              past: capacity === 0 ? [] : [...model.past, model.present].slice(-capacity),
              present: value,
              future: [],
            },
          }),
          Undo: () => {
            const previous = model.past[model.past.length - 1]
            if (previous === undefined) return { model }
            return {
              model: {
                past: model.past.slice(0, -1),
                present: previous,
                future: [model.present, ...model.future],
              },
            }
          },
          Redo: () => {
            const next = model.future[0]
            if (next === undefined) return { model }
            return {
              model: {
                past: [...model.past, model.present],
                present: next,
                future: model.future.slice(1),
              },
            }
          },
          Clear: () => ({ model: { past: [], present: model.present, future: [] } }),
        }),
    }),
    // The union object is both the Message codec and its constructors, so a
    // placement dispatches `EditHistory.Message.Push(...)` like any bundle's
    // exported Message.
    { Message },
  )
}

/** Whether Undo would move: the past is non-empty. */
export const canUndo = <Value>(model: HistoryModel<Value>): boolean => model.past.length > 0

/** Whether Redo would move: the future is non-empty. */
export const canRedo = <Value>(model: HistoryModel<Value>): boolean => model.future.length > 0
