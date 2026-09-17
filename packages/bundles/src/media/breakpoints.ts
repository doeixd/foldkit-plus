/**
 * Named breakpoints over the viewport width: one `resize` listener, derived
 * names in `update`. Thresholds are mobile-first min-widths: the breakpoint
 * is the largest name whose threshold is <= width. Ties break
 * alphabetically so duplicates stay deterministic.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'

export const BreakpointsModel = Schema.Struct({
  width: Schema.Number,
  breakpoint: Schema.NullOr(Schema.String),
})
export type BreakpointsModel = typeof BreakpointsModel.Type

export const BreakpointsMessage = defineMessageUnion({ Changed: { width: Schema.Number } })
export type BreakpointsMessage = typeof BreakpointsMessage.Type

export const breakpointFor = (
  width: number,
  breakpoints: Readonly<Record<string, number>>,
): string | null => {
  let best: string | null = null
  let bestThreshold = -Infinity
  for (const name of Object.keys(breakpoints)) {
    const threshold = breakpoints[name]!
    if (
      threshold <= width &&
      (threshold > bestThreshold || (threshold === bestThreshold && (best === null || name > best)))
    ) {
      best = name
      bestThreshold = threshold
    }
  }
  return best
}

const widthStream = (): Stream.Stream<BreakpointsMessage> => {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return Stream.empty
  }
  return Stream.unwrap(
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<BreakpointsMessage>()
      const onResize = () => {
        Effect.runFork(Queue.offer(queue, BreakpointsMessage.Changed({ width: window.innerWidth })))
      }
      window.addEventListener('resize', onResize)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          window.removeEventListener('resize', onResize)
        }),
      )
      return Stream.concat(
        Stream.make(BreakpointsMessage.Changed({ width: window.innerWidth })),
        Stream.fromQueue(queue),
      )
    }),
  )
}

export const Breakpoints = Bundle.make('Breakpoints', {
  Model: BreakpointsModel,
  Message: BreakpointsMessage,
  args: Schema.Struct({ breakpoints: Schema.Record(Schema.String, Schema.Number) }),
  init: args => ({
    model: { width: 0, breakpoint: breakpointFor(0, args.breakpoints) },
  }),
  update: (model, message, args) =>
    BreakpointsMessage.match(message, {
      Changed: ({ width }) => ({
        model: { width, breakpoint: breakpointFor(width, args.breakpoints) },
      }),
    }),
  subscriptions: (): Subscription.Subscriptions<BreakpointsModel, BreakpointsMessage> =>
    Subscription.make<BreakpointsModel, BreakpointsMessage>()(() => ({
      changes: Subscription.persistent(widthStream()),
    })),
})
