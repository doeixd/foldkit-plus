/**
 * A wall-clock interval as a bundle: the last tick time in the Model,
 * advanced by a tick stream while running. Sibling of Timer (which counts
 * ticks); this one records *when* they happened, so views can render clocks
 * and elapsed times. The clock is Effect's, so tests drive it with TestClock.
 */
import { Clock, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

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
        Started: () => ({ model: { ...model, running: true } }),
        Stopped: () => ({ model: { ...model, running: false } }),
        Ticked: ({ at }) => ({ model: { ...model, lastAt: at } }),
      },
    ),
  subscriptions: ({ intervalMs }): Subscription.Subscriptions<IntervalModel, IntervalMessage> =>
    Subscription.make<IntervalModel, IntervalMessage>()(entry => ({
      ticks: entry(
        { running: Schema.Boolean },
        {
          modelToDependencies: model => ({ running: model.running }),
          dependenciesToStream: ({ running }) =>
            running
              ? Stream.mapEffect(Stream.tick(intervalMs), () => Clock.currentTimeMillis).pipe(
                  Stream.map(at => IntervalMessage.Ticked({ at })),
                )
              : Stream.empty,
        },
      ),
    })),
})
