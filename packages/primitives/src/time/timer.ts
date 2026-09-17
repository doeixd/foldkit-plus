/**
 * A timer as a bundle: a count in the Model, advanced by a tick stream while
 * running. The clock is Effect's, so tests drive it with TestClock instead of
 * waiting.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const TimerModel = Schema.Struct({ count: Schema.Number, running: Schema.Boolean })
export type TimerModel = typeof TimerModel.Type

export const TimerMessage = defineMessageUnion({
  Started: {},
  Stopped: {},
  Ticked: {},
})
export type TimerMessage = typeof TimerMessage.Type

export const Timer = Bundle.make('Timer', {
  Model: TimerModel,
  Message: TimerMessage,
  args: Schema.Struct({
    intervalMs: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThan(0)),
      Schema.check(Schema.isFinite()),
    ),
  }),
  init: () => ({ model: { count: 0, running: false } }),
  update: (model, message) =>
    TimerMessage.match(message, {
      Started: () => ({ model: { ...model, running: true } }),
      Stopped: () => ({ model: { ...model, running: false } }),
      Ticked: () => ({ model: { ...model, count: model.count + 1 } }),
    }),
  subscriptions: ({ intervalMs }): Subscription.Subscriptions<TimerModel, TimerMessage> =>
    Subscription.make<TimerModel, TimerMessage>()(entry => ({
      ticks: entry(
        { running: Schema.Boolean },
        {
          modelToDependencies: model => ({ running: model.running }),
          dependenciesToStream: ({ running }) =>
            running
              ? Stream.map(Stream.tick(intervalMs), () => TimerMessage.Ticked())
              : Stream.empty,
        },
      ),
    })),
})
