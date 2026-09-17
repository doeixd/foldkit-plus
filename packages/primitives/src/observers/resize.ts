/**
 * Element size as a Mount: ResizeObserver reports content-box changes as
 * Messages for the element carrying this Mount. No observer (SSR, old
 * browser) emits nothing instead of throwing.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const Resized = Schema.TaggedStruct('Resized', {
  width: Schema.Number,
  height: Schema.Number,
})
export type Resized = typeof Resized.Type

type ObserverCtor = new (callback: ResizeObserverCallback) => ResizeObserver

export const Resize = Mount.defineStream('Resize', {
  messages: [Resized],
  execute: ({ element }) =>
    Stream.callback<typeof Resized.Type>(queue =>
      Effect.gen(function* () {
        const Observed = (globalThis as { ResizeObserver?: ObserverCtor }).ResizeObserver
        if (Observed === undefined) return
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const observer = new Observed(entries => {
              const rect = entries[0]?.contentRect
              if (rect !== undefined) {
                Queue.offerUnsafe(queue, Resized.make({ width: rect.width, height: rect.height }))
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
