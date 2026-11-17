/**
 * A Mount on the element around the formatting bar that reports the bar's own width and scroll
 * width as it changes: when the column resizes, and when the bar's controls change (a level of
 * `toolsFit` drawing more or fewer of them, a face loading). The scroll width is what the bar
 * needs, which the column's width alone cannot say.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const BarMeasured = Schema.TaggedStruct('BarMeasured', {
  width: Schema.Number,
  scroll: Schema.Number,
})

type ObserverConstructor = new (callback: () => void) => ResizeObserver

export const MeasureBar = Mount.defineStream('MeasureBar', {
  messages: [BarMeasured],
  execute: ({ element }) =>
    Stream.callback<typeof BarMeasured.Type>(queue =>
      Effect.gen(function* () {
        const Observing = (globalThis as { ResizeObserver?: ObserverConstructor }).ResizeObserver
        if (Observing === undefined) return
        let last = ''
        const report = () => {
          const bar = element.querySelector('[role="toolbar"]')
          if (bar === null) return
          const width = bar.clientWidth
          const scroll = bar.scrollWidth
          const key = `${width}:${scroll}`
          if (key === last) return
          last = key
          Queue.offerUnsafe(queue, BarMeasured.make({ width, scroll }))
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            // Both observers made before either observes, so a failure leaves nothing attached.
            const resized = new Observing(report)
            const changed = new MutationObserver(report)
            resized.observe(element)
            changed.observe(element, { childList: true, subtree: true })
            report()
            return { resized, changed }
          }),
          ({ resized, changed }) =>
            Effect.sync(() => {
              resized.disconnect()
              changed.disconnect()
            }),
        )
      }),
    ),
})
