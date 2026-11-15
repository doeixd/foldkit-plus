import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { reducedMotion } from './motion.js'

export const PresenceModel = Schema.Struct({
  phase: Schema.Literals(['shown', 'hiding', 'hidden']),
  generation: Schema.Number,
})
export type PresenceModel = typeof PresenceModel.Type

export const PresenceMessage = defineMessageUnion({
  Show: {},
  Hide: {},
  Hidden: { generation: Schema.Number },
})
export type PresenceMessage = typeof PresenceMessage.Type

/** Whether the content renders: shown or mid-exit. */
export const isVisible = (model: PresenceModel): boolean => model.phase !== 'hidden'

const PresenceArgs = Schema.Struct({
  durationMs: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThan(0)),
    Schema.check(Schema.isFinite()),
  ),
})

const update = (
  model: PresenceModel,
  message: PresenceMessage,
  args: typeof PresenceArgs.Type,
): Update.ReturnWithOutMessage<PresenceModel, PresenceMessage, never> =>
  PresenceMessage.match<Update.ReturnWithOutMessage<PresenceModel, PresenceMessage, never>>(
    message,
    {
      // Every new transition invalidates pending timeouts. While shown none is
      // pending, and hiding what is hidden would show it for `durationMs`.
      Show: () =>
        model.phase === 'shown'
          ? { model }
          : { model: { ...model, phase: 'shown' as const, generation: model.generation + 1 } },
      Hide: () => {
        if (model.phase === 'hidden') return { model }
        const generation = model.generation + 1
        return {
          model: { ...model, phase: 'hiding' as const, generation },
          commands: [
            {
              name: 'Presence.hide',
              args: { generation },
              effect: Effect.flatMap(reducedMotion, reduced =>
                reduced
                  ? Effect.succeed(PresenceMessage.Hidden({ generation }))
                  : Effect.as(
                      Effect.sleep(args.durationMs),
                      PresenceMessage.Hidden({ generation }),
                    ),
              ),
            },
          ],
        }
      },
      Hidden: ({ generation }) =>
        generation === model.generation
          ? { model: { ...model, phase: 'hidden' as const } }
          : { model },
    },
  )

/**
 * Presence as a bundle: mount-transition state for exit animations. `Hide`
 * starts a timed `hiding` phase; the `Hidden` fact it yields carries the
 * generation it was scheduled under, so a `Show` in between wins and the
 * late fact is ignored. The clock is Effect's, so tests drive it.
 */
export const Presence = Bundle.make('Presence', {
  Model: PresenceModel,
  Message: PresenceMessage,
  args: PresenceArgs,
  init: () => ({ model: { phase: 'hidden', generation: 0 } }),
  update,
  /**
   * What a parent decides: `placed.helpers.hide()` starts the exit a dismiss
   * button asks for and `show()` brings the content back, as `Hide` and
   * `Show` do; a placement per row (`each`) takes the row's key first.
   */
  helpers: args => ({
    show: (model: PresenceModel) => update(model, PresenceMessage.Show(), args),
    hide: (model: PresenceModel) => update(model, PresenceMessage.Hide(), args),
  }),
})
