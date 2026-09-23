/**
 * Whether motion should be reduced, as a service read when a transition
 * starts, not sniffed once. Absent, motion is full, so a placement that
 * provides nothing behaves as before; a page provides `live` (the user's
 * `prefers-reduced-motion`) and a test provides `reduced` or `full`. Under
 * reduced motion a presence exits at once and a tween or spring jumps to its
 * end, in the same Messages, so the Model sees the same transitions.
 */
import { Context, Effect, Layer, Option } from 'effect'

export interface MotionShape {
  readonly reduced: Effect.Effect<boolean>
}

export class Motion extends Context.Service<Motion, MotionShape>()('foldkit-primitives/Motion') {}

/** Reduced or full motion, fixed: for a test or a setting the application owns. */
export const layer = (reduced: boolean): Layer.Layer<Motion> =>
  Layer.succeed(Motion, { reduced: Effect.succeed(reduced) })

export const reduced: Layer.Layer<Motion> = layer(true)
export const full: Layer.Layer<Motion> = layer(false)

/** The user's `prefers-reduced-motion`, read each time a transition starts. */
export const live: Layer.Layer<Motion> = Layer.succeed(Motion, {
  reduced: Effect.sync(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ),
})

/** Whether to reduce motion now: the service's answer, or `false` without one. */
export const reducedMotion: Effect.Effect<boolean> = Effect.flatMap(
  Effect.serviceOption(Motion),
  Option.match({ onNone: () => Effect.succeed(false), onSome: motion => motion.reduced }),
)
