import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const NearEnd = Schema.TaggedStruct('NearEnd', {})

type ObserverCtor = new (
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit,
) => IntersectionObserver

/** How far ahead of the end the next rows are asked for, so they arrive before they are needed. */
const ahead = '200px'

/**
 * The element coming within 200px of the grid's visible box: one report each
 * time it comes in, measured against the scroll container it sits in, not
 * the page. No observer (SSR, an old browser) reports nothing.
 */
export const Nearing = Mount.defineStream('DataGridNearEnd', {
  messages: [NearEnd],
  execute: ({ element }) =>
    Stream.callback<typeof NearEnd.Type>(queue =>
      Effect.gen(function* () {
        const Observer = (globalThis as { IntersectionObserver?: ObserverCtor })
          .IntersectionObserver
        if (Observer === undefined) return
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const observer = new Observer(
              entries => {
                if (entries.some(entry => entry.isIntersecting)) {
                  Queue.offerUnsafe(queue, NearEnd.make({}))
                }
              },
              { root: element.closest('[role="grid"]'), rootMargin: ahead },
            )
            observer.observe(element)
            return observer
          }),
          observer => Effect.sync(() => observer.disconnect()),
        )
      }),
    ),
})
