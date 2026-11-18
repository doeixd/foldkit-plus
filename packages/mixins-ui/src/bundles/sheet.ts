import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, Side, SwipeFrom, close, init, open, update } from '../sheet.js'

/**
 * A Sheet's state for `foldkit-bundle`: an upstream Dialog with the edge it
 * comes from, the points it rests at and the drag running, with
 * `Sheet.init`'s options as the args. It reports the Dialog's `Opened` and
 * `Closed` in `onOut`; `helpers.open` and `helpers.close` are the buttons of
 * the application's. It holds no view: draw the placed Model with
 * `Sheet.view`.
 */
export const Sheet = Bundle.make('Sheet', {
  Model,
  Message,
  args: Schema.Struct({
    /** The Dialog's id, unique in the document. */
    id: Schema.String,
    /** The edge it comes from. Default `bottom`. */
    side: Schema.optionalKey(Side),
    /** How much of the panel shows at each resting point, ascending in (0, 1]. Default `[1]`. */
    points: Schema.optionalKey(Schema.Array(Schema.Number)),
    /** The index in `points` it opens at. Default 0. */
    opensAt: Schema.optionalKey(Schema.Number),
    /** Whether a drag may take it away. Default true. */
    dismissible: Schema.optionalKey(Schema.Boolean),
    /** Whether it slides in and out. Default true. */
    isAnimated: Schema.optionalKey(Schema.Boolean),
    swipe: Schema.optionalKey(
      Schema.Struct({
        /** `panel` (a finger anywhere on it, the default) or `handle`. */
        from: Schema.optionalKey(SwipeFrom),
        /** Pixels a millisecond a release needs to be a flick. */
        flickSpeed: Schema.optionalKey(Schema.Number),
        /** The share of the panel, in (0, 1], a slow drag takes it away by. */
        closeShare: Schema.optionalKey(Schema.Number),
      }),
    ),
  }),
  init: args => ({ model: init(args) }),
  update,
  helpers: { open, close },
})
