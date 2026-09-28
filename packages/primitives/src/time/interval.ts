/**
 * A wall-clock interval as a bundle: the last tick time in the Model,
 * advanced by a tick stream while running. Sibling of Timer (which counts
 * ticks); this one records *when* they happened, so views can render clocks
 * and elapsed times. The clock is Effect's, so tests drive it with TestClock.
 * For a clock whose running or interval the parent's Model decides, use the
 * `ticks` entry instead.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { ticks } from './ticks.js'

export const IntervalModel = Schema.Struct({
  running: Schema.Boolean,
  lastAt: Schema.NullOr(Schema.Number),
})
export type IntervalModel = typeof IntervalModel.Type

export const IntervalMessage = defineMessageUnion({
  Started: {},
  Stopped: {},
  Ticked: { at: Schema.Number },
})
export type IntervalMessage = typeof IntervalMessage.Type

export const Interval = Bundle.make('Interval', {
  Model: IntervalModel,
  Message: IntervalMessage,
  args: Schema.Struct({
    intervalMs: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThan(0)),
      Schema.check(Schema.isFinite()),
    ),
  }),
  init: () => ({ model: { running: false, lastAt: null } }),
  update: (model, message) =>
    IntervalMessage.match<Update.ReturnWithOutMessage<IntervalModel, IntervalMessage, never>>(
      message,
      {
        Started: () => (model.running ? { model } : { model: { ...model, running: true } }),
        Stopped: () => (model.running ? { model: { ...model, running: false } } : { model }),
        Ticked: ({ at }) => ({ model: { ...model, lastAt: at } }),
      },
    ),
  subscriptions: ({ intervalMs }) => ({
    ticks: ticks<IntervalModel, IntervalMessage>({
      intervalMs: model => (model.running ? Option.some(intervalMs) : Option.none()),
      onTick: at => IntervalMessage.Ticked({ at }),
    }),
  }),
})
