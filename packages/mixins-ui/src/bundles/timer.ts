import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../timer.js'

/**
 * A Timer's state for `foldkit-bundle`: the count, its clock reading and the
 * turn, with `Timer.init`'s options as the args. A countdown needs its
 * `duration`; a stopwatch may stop at one. Its Commands read Effect's `Clock`
 * and nothing is reported: the application reads `Timer.phase` of the placed
 * Model for `done`. It holds no view: draw the placed Model with `Timer.view`.
 */
export const Timer = Bundle.make('Timer', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the timer draws, unique on the page. */
    id: Schema.String,
    /** Milliseconds between the display's changes. Default 1000. */
    interval: Schema.optionalKey(Schema.Number),
    /** Counts down from `duration` rather than up from 0. */
    countdown: Schema.optionalKey(Schema.Boolean),
    /** Milliseconds a countdown starts from, or a stopwatch stops at. */
    duration: Schema.optionalKey(Schema.Number),
  }),
  init: ({ id, interval, countdown, duration }) => {
    if (countdown === true && duration === undefined) {
      throw new Error(`Bundles.Timer ${id}: a countdown needs a duration`)
    }
    return {
      model: init(
        countdown === true && duration !== undefined
          ? { id, interval, countdown, duration }
          : { id, interval, duration },
      ),
    }
  },
  update,
})
