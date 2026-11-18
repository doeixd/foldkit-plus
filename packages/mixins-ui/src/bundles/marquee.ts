import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../marquee.js'

/**
 * A Marquee's state for `foldkit-bundle`: whether it is held, and the two
 * lengths its Mount measures, with `Marquee.init`'s options as the args.
 * Nothing is reported. It holds no view: draw the placed Model with
 * `Marquee.view`.
 */
export const Marquee = Bundle.make('Marquee', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the marquee draws, unique on the page. */
    id: Schema.String,
    /** Starts held. */
    paused: Schema.optionalKey(Schema.Boolean),
  }),
  init: args => ({ model: init(args) }),
  update,
})
