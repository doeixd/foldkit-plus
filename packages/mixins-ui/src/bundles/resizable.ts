import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../resizable.js'

/**
 * A Resizable's split for `foldkit-bundle`: the first panel's share, a drag
 * and a collapse, with the bounds as args beside the starting `share`. The
 * bounds are kept in the Model, so `update` and `Resizable.view` both read
 * them and neither is told again. It holds no view: draw the placed Model with
 * `Resizable.view`.
 */
export const Resizable = Bundle.make('Resizable', {
  Model,
  Message,
  args: Schema.Struct({
    /** The first panel's share to start at, 0 to 1; default 0.5. */
    share: Schema.optionalKey(Schema.Number),
    /** The least share a drag or a key leaves; default 0.1. */
    min: Schema.optionalKey(Schema.Number),
    /** The most; default 0.9. */
    max: Schema.optionalKey(Schema.Number),
    /** What an arrow key moves the share by; default 0.05. */
    step: Schema.optionalKey(Schema.Number),
    /** The panel Enter and a double-click collapse. */
    collapsible: Schema.optionalKey(Schema.Literals(['first', 'second'])),
    /** The share a collapsed panel keeps; default 0. */
    collapsedTo: Schema.optionalKey(Schema.Number),
  }),
  init: ({ share, ...bounds }) => ({ model: init(share, bounds) }),
  update: (model, message) => ({ model: update(model, message) }),
})
