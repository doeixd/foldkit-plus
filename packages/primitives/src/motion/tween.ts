/**
 * A tween as a bundle: a number animated from one value to another over a
 * duration, in the Model. Progress comes from Effect's clock, so tests drive
 * it with TestClock; the stream ends with Finished, and the value rests at
 * `to`. Linear interpolation only: easing curves stay the application's job.
 */
import { Clock, Effect, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const TweenModel = Schema.Struct({ value: Schema.Number, running: Schema.Boolean })
export type TweenModel = typeof TweenModel.Type

export const TweenMessage = defineMessageUnion({
  Started: {},
  Stopped: {},
  Ticked: { value: Schema.Number },
  /** Carries the exact end value: the stream may stop on either side of it. */
  Finished: { value: Schema.Number },
})
export type TweenMessage = typeof TweenMessage.Type

export const Tween = Bundle.make('Tween', {
  Model: TweenModel,
  Message: TweenMessage,
  args: Schema.Struct({
    from: Schema.Number.pipe(Schema.check(Schema.isFinite())),
    to: Schema.Number.pipe(Schema.check(Schema.isFinite())),
    ms: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)), Schema.check(Schema.isFinite())),
  }),
  init: args => ({ model: { value: args.from, running: false } }),
  update: (model, message) =>
    TweenMessage.match(message, {
      Started: () => ({ model: { ...model, running: true } }),
      Stopped: () => ({ model: { ...model, running: false } }),
      Ticked: ({ value }) => ({ model: { ...model, value } }),
      Finished: ({ value }) => ({ model: { ...model, value, running: false } }),
    }),
  subscriptions: ({ from, to, ms }): Subscription.Subscriptions<TweenModel, TweenMessage> =>
    Subscription.make<TweenModel, TweenMessage>()(entry => ({
      ticks: entry(
        { running: Schema.Boolean },
        {
          modelToDependencies: model => ({ running: model.running }),
          dependenciesToStream: ({ running }) =>
            running
              ? Stream.unwrap(
                  Clock.currentTimeMillis.pipe(
                    Effect.map(startedAt => {
                      const progress = Stream.tick(16).pipe(
                        Stream.mapEffect(() => Clock.currentTimeMillis),
                        Stream.map(now => Math.min(1, (now - startedAt) / ms)),
                      )
                      return Stream.concat(
                        progress.pipe(
                          Stream.takeUntil(done => done >= 1),
                          Stream.map(done =>
                            TweenMessage.Ticked({ value: from + (to - from) * done }),
                          ),
                        ),
                        Stream.make(TweenMessage.Finished({ value: to })),
                      )
                    }),
                  ),
                )
              : Stream.empty,
        },
      ),
    })),
})
