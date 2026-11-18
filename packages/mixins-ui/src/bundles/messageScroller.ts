import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../messageScroller.js'

/**
 * A conversation's scroll state for `foldkit-bundle`: whether it follows the
 * end, and how many messages came in while it did not. The args are its `id`
 * and where it `opens`. The application sends `Appended` through the placement
 * when a message lands at the end; draw the placed Model with
 * `MessageScroller.view`, whose Mount reports what the reader does.
 */
export const MessageScroller = Bundle.make('MessageScroller', {
  Model,
  Message,
  args: Schema.Struct({
    id: Schema.String,
    opens: Schema.optionalKey(Schema.Literals(['start', 'end'])),
  }),
  init: args => ({ model: init(args) }),
  update,
})
