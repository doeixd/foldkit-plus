/**
 * A number stepper. The value is the Model's, clamped to its bounds; each of
 * the two buttons is a `Repeat` placement, which keeps only what a press is
 * (down, how many steps it made) and reports `Stepped`. `update` turns a step
 * into a change of the value and, at a bound, tells that placement to stop: the
 * hold's later steps would change nothing. A hold speeds up by taking bigger
 * strides as its count grows, which is the Model's rule, not the primitive's.
 */
import { Effect, Match, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Repeat } from 'foldkit-primitives/interaction'

export const MIN = 0
export const MAX = 100
export const START = 50

/** Steps of one made by the first five of a hold; after that each takes a bigger stride. */
const SLOW_STEPS = 5
export const FAST_STRIDE = 5

export const Less = Bundle.declare(Repeat.bundle, 'less')
export const More = Bundle.declare(Repeat.bundle, 'more')

export const repeatArgs = { delayMs: 300, intervalMs: 60 } as const

export const Model = Schema.Struct({
  ...Less.fields,
  ...More.fields,
  value: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Less.cases,
  ...More.cases,
})
export type Message = typeof Message.Type

/** The distance step number `count` of a hold moves: one each at first, then `FAST_STRIDE`. */
export const strideOf = (count: number): number => (count <= SLOW_STEPS ? 1 : FAST_STRIDE)

const clamp = (value: number): number => Math.min(MAX, Math.max(MIN, value))

const StopRepeat = Command.define('StopRepeat', {
  messages: [Repeat.Message.Stopped],
  execute: Effect.succeed(Repeat.Message.Stopped()),
})

const Parent = Bundle.parent({ Model, Message })

/** What a hold of one button does to the value: `direction` is -1 for less, +1 for more. */
const folding =
  (direction: -1 | 1) =>
  (
    out: Repeat.Out,
    { liftCommand }: Update.FoldContext<Repeat.Message, Message>,
  ): Update.Step<Model, Message> =>
    Match.valueTags(out, {
      Stepped:
        ({ count }) =>
        (model: Model) => {
          const value = clamp(model.value + direction * strideOf(count))
          const atBound = value === (direction === 1 ? MAX : MIN)
          const next = value === model.value ? model : { ...model, value }
          return { model: next, commands: atBound ? [liftCommand(StopRepeat())] : [] }
        },
      // A hold's end changes nothing the Model keeps: the value already moved with each step.
      Ended: () => (model: Model) => ({ model }),
    })

export const assembly = Parent.assemble(
  Parent.at(Less, { args: repeatArgs, onOut: folding(-1) }),
  Parent.at(More, { args: repeatArgs, onOut: folding(1) }),
)

export const initial = () => assembly.initial({ value: START })

export const update = assembly.update()
