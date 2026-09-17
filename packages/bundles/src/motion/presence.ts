/**
 * Presence as a bundle: mount-transition state for exit animations. `Hide`
 * starts a timed `hiding` phase; the `Hidden` fact it yields carries the
 * generation it was scheduled under, so a `Show` in between wins and the
 * late fact is ignored. The clock is Effect's, so tests drive it.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

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

export const Presence = Bundle.make<
  'Presence',
  PresenceModel,
  PresenceMessage,
  { readonly durationMs: number },
  never,
  never,
  never,
  void,
  {},
  {}
>('Presence', {
  Model: PresenceModel,
  Message: PresenceMessage,
  args: Schema.Struct({
    durationMs: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThan(0)),
      Schema.check(Schema.isFinite()),
    ),
  }),
  init: () => ({ model: { phase: 'hidden', generation: 0 } }),
  update: (model, message, args) =>
    PresenceMessage.match<Update.ReturnWithOutMessage<PresenceModel, PresenceMessage, never>>(
      message,
      {
        // Every new transition invalidates pending timeouts.
        Show: () => ({
          model: { ...model, phase: 'shown' as const, generation: model.generation + 1 },
        }),
        Hide: () => {
          const generation = model.generation + 1
          return {
            model: { ...model, phase: 'hiding' as const, generation },
            commands: [
              {
                name: 'Presence.hide',
                args: { generation },
                effect: Effect.as(
                  Effect.sleep(args.durationMs),
                  PresenceMessage.Hidden({ generation }),
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
    ),
})
