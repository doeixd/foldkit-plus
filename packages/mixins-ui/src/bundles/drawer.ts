import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, close, init, open, update } from '../drawer.js'
import { SwipeFrom } from '../swipe.js'

/**
 * A Drawer's state for `foldkit-bundle`: whether the docked panel is open or
 * peeking, and the drag running, with `Drawer.init`'s options as the args.
 * Nothing is reported: the panel is beside the page, not over it. `helpers.open`
 * and `helpers.close` are for a control of the application's. It holds no
 * view: draw the placed Model with `Drawer.view`.
 */
export const Drawer = Bundle.make('Drawer', {
  Model,
  Message,
  args: Schema.Struct({
    /** The body's id, unique in the document, which the handle controls. */
    id: Schema.String,
    /** Whether it starts open. Default false: peeking. */
    open: Schema.optionalKey(Schema.Boolean),
    swipe: Schema.optionalKey(
      Schema.Struct({
        /** `panel` (a finger anywhere on it, the default) or `handle`. */
        from: Schema.optionalKey(SwipeFrom),
        /** Pixels a millisecond a release needs to be a flick. */
        flickSpeed: Schema.optionalKey(Schema.Number),
        /** The share of the panel, in (0, 1], a slow drag must cover. */
        closeShare: Schema.optionalKey(Schema.Number),
      }),
    ),
  }),
  init: args => ({ model: init(args) }),
  update: (model, message) => ({ model: update(model, message) }),
  helpers: {
    open: (model: Model) => ({ model: open(model) }),
    close: (model: Model) => ({ model: close(model) }),
  },
})
