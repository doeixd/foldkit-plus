import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, Step, init, start, update } from '../tour.js'

/**
 * A Tour's walk for `foldkit-bundle`: the steps and the current one, with
 * `Tour.init`'s options as the args. The steps are kept in the Model, so
 * `update` and `Tour.view` both read them and neither is told again. It
 * reports `Ended { completed }` in `onOut`; `helpers.start` starts it (over
 * again if it runs). It holds no view: draw the placed Model with `Tour.view`.
 */
export const Tour = Bundle.make('Tour', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the tour draws, unique on the page. */
    id: Schema.String,
    steps: Schema.optionalKey(Schema.Array(Step)),
  }),
  init: args => ({ model: init(args) }),
  update: update(),
  helpers: { start: (model: Model) => start(model) },
})
