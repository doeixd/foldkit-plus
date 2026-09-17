/**
 * Online presence as a bundle: `online` in the Model, kept current by the
 * window's online/offline events. The browser reports facts; the Model owns
 * the state, so presence replays like any other transition.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const OnlineModel = Schema.Struct({ online: Schema.Boolean })
export type OnlineModel = typeof OnlineModel.Type

export const OnlineMessage = defineMessageUnion({ Changed: { online: Schema.Boolean } })
export type OnlineMessage = typeof OnlineMessage.Type

const presenceStream = (): Stream.Stream<OnlineMessage> => {
  // No window (SSR): nothing to listen to, so the slice keeps its default.
  if (typeof window === 'undefined') return Stream.empty
  return Stream.mergeAll(
    [
      Stream.fromEventListener(window, 'online').pipe(
        Stream.map(() => OnlineMessage.Changed({ online: true })),
      ),
      Stream.fromEventListener(window, 'offline').pipe(
        Stream.map(() => OnlineMessage.Changed({ online: false })),
      ),
    ],
    { concurrency: 'unbounded' },
  )
}

export const Online = Bundle.make('Online', {
  Model: OnlineModel,
  Message: OnlineMessage,
  init: () => ({
    // navigator.onLine is the browser's current answer; true elsewhere (SSR).
    model: {
      online:
        typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
          ? navigator.onLine
          : true,
    },
  }),
  update: (model, message) => ({ model: { online: message.online } }),
  subscriptions: (): Subscription.Subscriptions<OnlineModel, OnlineMessage> =>
    Subscription.make<OnlineModel, OnlineMessage>()(() => ({
      changes: Subscription.persistent(presenceStream()),
    })),
})
