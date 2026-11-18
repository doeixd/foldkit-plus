import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, reveal, update, type Align } from '../windowList.js'

/**
 * A WindowList's state for `foldkit-bundle`: the measured heights, where the
 * viewport lies and the row holding focus, with `WindowList.init`'s options
 * as the args. `helpers.reveal(index, align?)` scrolls a row into view. It
 * holds no view: draw the placed Model with `WindowList.view`.
 */
export const WindowList = Bundle.make('WindowList', {
  Model,
  Message,
  args: Schema.Struct({
    /** The list's id, unique in the document. */
    id: Schema.String,
    /** A row's height until it is measured, in pixels. */
    estimatedHeight: Schema.Number,
    /** What a row not yet measured counts: the estimate (default) or the mean measured. */
    unmeasured: Schema.optionalKey(Schema.Literals(['estimate', 'mean'])),
    /** Rows drawn beyond the viewport at each end; default 5. */
    overscan: Schema.optionalKey(Schema.Number),
    /** The viewport's height assumed before the list is placed; default 1000. */
    viewportHeight: Schema.optionalKey(Schema.Number),
    /** The row the list opens at; default 0. */
    from: Schema.optionalKey(Schema.Number),
  }),
  init: args => ({ model: init(args) }),
  update,
  helpers: {
    reveal: (model: Model, index: number, align?: Align) => ({
      model,
      commands: [reveal(model, index, align)],
    }),
  },
})
