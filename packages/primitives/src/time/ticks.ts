/**
 * A clock the parent owns, as an entry: whether it ticks and how fast are
 * functions of the parent's Model, so nothing keeps a second running flag or
 * interval beside the state they derive from (a game's phase and score).
 * Timer and Interval are built on it, for a clock that owns its own flag.
 */
import { Clock, Effect, Option, Schema, Stream } from 'effect'
import * as Subscription from 'foldkit/subscription'

const TickDependencies = { intervalMs: Schema.Option(Schema.Number) }
type TickDependencies = { readonly intervalMs: Option.Option<number> }

const checked = (intervalMs: Option.Option<number>): Option.Option<number> => {
  // A zero, negative or non-finite interval would spin or never tick; the
  // runtime crashes on a defect here, which names the mistake where it is made.
  if (Option.isSome(intervalMs) && !(intervalMs.value > 0 && Number.isFinite(intervalMs.value)))
    throw new Error(`ticks: intervalMs must be positive and finite, got ${intervalMs.value}`)
  return intervalMs
}

/**
 * Ticks while `intervalMs` answers `Some`, each tick one interval after the
 * last and the first one interval after starting. A changed interval applies
 * from the next tick, with no restart; other Model changes do nothing.
 */
export const ticks = <Model, Message>(config: {
  /** The time between ticks for this Model, in milliseconds; `None` stops the clock. */
  readonly intervalMs: (model: Model) => Option.Option<number>
  /** The Message a tick sends, given its time on Effect's clock. */
  readonly onTick: (at: number) => Message
}): Subscription.Subscription<Model, Message, TickDependencies> =>
  Subscription.make<Model, Message>()(entry => ({
    ticks: entry(TickDependencies, {
      modelToDependencies: model => ({ intervalMs: checked(config.intervalMs(model)) }),
      // Stopping and starting restart the stream; a new interval does not, so
      // a clock that speeds up keeps its phase instead of ticking at once.
      keepAliveEquivalence: (a, b) => Option.isSome(a.intervalMs) === Option.isSome(b.intervalMs),
      dependenciesToStream: ({ intervalMs }, readDependencies) =>
        Option.match(intervalMs, {
          onNone: () => Stream.empty,
          onSome: started =>
            Stream.fromEffectRepeat(
              Effect.suspend(() =>
                Effect.sleep(Option.getOrElse(readDependencies().intervalMs, () => started)),
              ).pipe(Effect.andThen(Clock.currentTimeMillis), Effect.map(config.onTick)),
            ),
        }),
    }),
  })).ticks
