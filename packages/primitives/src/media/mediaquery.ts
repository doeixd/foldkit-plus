/**
 * A media query as a bundle: `matches` in the Model, kept current by a
 * `matchMedia` change stream. State stays in the parent Model, so it replays
 * and time-travels like any other state; the browser only reports facts.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
export type MediaQueryModel = typeof MediaQueryModel.Type

export const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
export type MediaQueryMessage = typeof MediaQueryMessage.Type

const matchMediaStream = (query: string): Stream.Stream<MediaQueryMessage> => {
  // No window (SSR) or no matchMedia (old browser, minimal DOM): nothing to
  // listen to, so the slice keeps its initial value instead of throwing.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return Stream.empty
  return Stream.unwrap(
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<MediaQueryMessage>()
      const list = window.matchMedia(query)
      const onChange = (event: MediaQueryListEvent) => {
        Effect.runFork(Queue.offer(queue, MediaQueryMessage.Changed({ matches: event.matches })))
      }
      list.addEventListener('change', onChange)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          list.removeEventListener('change', onChange)
        }),
      )
      // The current value first, so the Model is right before the first change.
      return Stream.concat(
        Stream.make(MediaQueryMessage.Changed({ matches: list.matches })),
        Stream.fromQueue(queue),
      )
    }),
  )
}

export const MediaQuery = Bundle.make('MediaQuery', {
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  args: Schema.Struct({ query: Schema.String }),
  init: () => ({ model: { matches: false } }),
  update: (model, message) => ({ model: { matches: message.matches } }),
  subscriptions: ({ query }): Subscription.Subscriptions<MediaQueryModel, MediaQueryMessage> =>
    Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
      changes: Subscription.persistent(matchMediaStream(query)),
    })),
})

/** `(prefers-color-scheme: dark)`, bound so placements give no args. */
export const PrefersDark = MediaQuery.with({ query: '(prefers-color-scheme: dark)' })

/** `(prefers-reduced-motion: reduce)`, bound so placements give no args. */
export const PrefersReducedMotion = MediaQuery.with({ query: '(prefers-reduced-motion: reduce)' })
