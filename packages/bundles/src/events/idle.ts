/**
 * Idleness as a bundle: `idle` in the Model, flipped by activity and
 * silence. While active, activity debounced past `timeoutMs` settles to
 * `BecameIdle`; while idle, the first activity wakes to `BecameActive` and
 * the dependency flip restarts the watch. Starts active — a lurker idles
 * when the timeout elapses. The clock is Effect's, so tests drive it with
 * TestClock.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

export const IdleModel = Schema.Struct({ idle: Schema.Boolean })
export type IdleModel = typeof IdleModel.Type

export const IdleMessage = defineMessageUnion({ BecameIdle: {}, BecameActive: {} })
export type IdleMessage = typeof IdleMessage.Type

const activity = (): Stream.Stream<unknown> => {
  if (typeof window === 'undefined') return Stream.empty
  // One stream per sense; the merge fans into the debounce below.
  const senses: Array<Stream.Stream<unknown>> = [
    Stream.fromEventListener(window, 'mousemove'),
    Stream.fromEventListener(window, 'keydown'),
    Stream.fromEventListener(window, 'pointerdown'),
    Stream.fromEventListener(window, 'scroll'),
  ]
  return Stream.mergeAll(senses, { concurrency: 'unbounded' })
}

export const Idle = Bundle.make('Idle', {
  Model: IdleModel,
  Message: IdleMessage,
  args: Schema.Struct({ timeoutMs: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))) }),
  init: () => ({ model: { idle: false } }),
  update: (model, message) =>
    IdleMessage.match<Update.ReturnWithOutMessage<IdleModel, IdleMessage, never>>(message, {
      BecameIdle: () => ({ model: { ...model, idle: true } }),
      BecameActive: () => ({ model: { ...model, idle: false } }),
    }),
  subscriptions: ({ timeoutMs }): Subscription.Subscriptions<IdleModel, IdleMessage> =>
    Subscription.make<IdleModel, IdleMessage>()(entry => ({
      watch: entry(
        { idle: Schema.Boolean },
        {
          modelToDependencies: model => ({ idle: model.idle }),
          dependenciesToStream: ({ idle }) =>
            idle
              ? activity().pipe(
                  Stream.take(1),
                  Stream.map(() => IdleMessage.BecameActive()),
                )
              : // Seeded with subscribe time as last-known-alive: silence from
                // here still settles, so a lurker idles without moving first.
                Stream.concat(Stream.make(null), activity()).pipe(
                  Stream.debounce(timeoutMs),
                  Stream.map(() => IdleMessage.BecameIdle()),
                ),
        },
      ),
    })),
})
