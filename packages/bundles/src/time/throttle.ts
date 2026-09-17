/**
 * Leading-edge throttle as a bundle: the first `Attempted` in an interval
 * surfaces a `Throttled` OutMessage, the rest are dropped. `Attempted`
 * reads the clock through a Command, so the check runs against Effect time
 * and tests drive it with TestClock. Trailing-edge needs are Debounce's:
 * pair the two rather than adding a second timer here.
 */
import { Clock, Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

export const ThrottleModel = Schema.Struct({ lastAt: Schema.NullOr(Schema.Number) })
export type ThrottleModel = typeof ThrottleModel.Type

export const ThrottleMessage = defineMessageUnion({
  Attempted: {},
  Evaluated: { now: Schema.Number },
})
export type ThrottleMessage = typeof ThrottleMessage.Type

export const Throttled = Schema.TaggedStruct('Throttled', { at: Schema.Number })
export type Throttled = typeof Throttled.Type

export const Throttle = Bundle.make('Throttle', {
  Model: ThrottleModel,
  Message: ThrottleMessage,
  args: Schema.Struct({
    intervalMs: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThan(0)),
      Schema.check(Schema.isFinite()),
    ),
  }),
  init: () => ({ model: { lastAt: null } }),
  update: (model, message, args) =>
    ThrottleMessage.match<Update.ReturnWithOutMessage<ThrottleModel, ThrottleMessage, Throttled>>(
      message,
      {
        Attempted: () => ({
          model,
          commands: [
            {
              name: 'Throttle.evaluate',
              effect: Effect.map(Clock.currentTimeMillis, now =>
                ThrottleMessage.Evaluated({ now }),
              ),
            },
          ],
        }),
        // First attempt ever, or the interval has passed: fire and stamp.
        Evaluated: ({ now }) =>
          model.lastAt === null || now - model.lastAt >= args.intervalMs
            ? { model: { lastAt: now }, outMessage: Throttled.make({ at: now }) }
            : { model },
      },
    ),
})
