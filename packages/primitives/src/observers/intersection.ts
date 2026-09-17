/**
 * Element visibility as a Mount: IntersectionObserver reports viewport
 * crossings as Messages for the element carrying this Mount. No observer
 * (SSR, old browser) emits nothing instead of throwing.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const IntersectionChanged = Schema.TaggedStruct('IntersectionChanged', {
  isIntersecting: Schema.Boolean,
  ratio: Schema.Number,
})
export type IntersectionChanged = typeof IntersectionChanged.Type

type ObserverCtor = new (callback: IntersectionObserverCallback) => IntersectionObserver

export const Intersection = Mount.defineStream('Intersection', {
  messages: [IntersectionChanged],
  execute: ({ element }) =>
    Stream.callback<typeof IntersectionChanged.Type>(queue =>
      Effect.gen(function* () {
        const Observed = (globalThis as { IntersectionObserver?: ObserverCtor })
          .IntersectionObserver
        if (Observed === undefined) return
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const observer = new Observed(entries => {
              const first = entries[0]
              if (first !== undefined) {
                Queue.offerUnsafe(
                  queue,
                  IntersectionChanged.make({
                    isIntersecting: first.isIntersecting,
                    ratio: first.intersectionRatio,
                  }),
                )
              }
            })
            observer.observe(element)
            return observer
          }),
          observer => Effect.sync(() => observer.disconnect()),
        )
      }),
    ),
})
