/**
 * Element bounds as a Mount: the bounding rect re-measured on
 * ResizeObserver, window scroll, and window resize, starting with the
 * current rect. Without a ResizeObserver the window events still measure —
 * position changes never needed the observer. No window (SSR) emits nothing
 * instead of throwing.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const Measured = Schema.TaggedStruct('Measured', {
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})
export type Measured = typeof Measured.Type

type ObserverCtor = new (callback: () => void) => {
  observe(element: Element): void
  disconnect(): void
}

export const Bounds = Mount.defineStream('Bounds', {
  messages: [Measured],
  execute: ({ element }) =>
    Stream.callback<typeof Measured.Type>(queue =>
      Effect.gen(function* () {
        if (typeof window === 'undefined') return
        const measure = () => {
          const rect = element.getBoundingClientRect()
          Queue.offerUnsafe(
            queue,
            Measured.make({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }),
          )
        }
        // Capture phase: container scrolls do not bubble, but every scroll
        // descends past the window first.
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            window.addEventListener('scroll', measure, true)
            window.addEventListener('resize', measure)
            const Observed = (globalThis as { ResizeObserver?: ObserverCtor }).ResizeObserver
            if (Observed === undefined) return null
            const observer = new Observed(measure)
            observer.observe(element)
            return observer
          }),
          observer =>
            Effect.sync(() => {
              window.removeEventListener('scroll', measure, true)
              window.removeEventListener('resize', measure)
              observer?.disconnect()
            }),
        )
        measure()
      }),
    ),
})
