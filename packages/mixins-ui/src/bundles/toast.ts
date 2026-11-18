import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, Position, dismiss, init, settle, show, update } from '../toast.js'

/**
 * A Toast stack's state for `foldkit-bundle`: the toasts, newest first, and
 * what holds the stack, with `Toast.init`'s options as the args. A toast's
 * action says `Acted` (its id and the action's value) in `onOut`. The
 * application raises, settles and dismisses toasts with the placement's
 * `helpers`: they take the stack's Model and what `Toast.show`,
 * `Toast.settle` and `Toast.dismiss` take, and return the Model with the
 * Commands wrapped as the placement wraps the stack's own. It holds no view:
 * draw the placed Model with `Toast.view`.
 */
export const Toast = Bundle.make('Toast', {
  Model,
  Message,
  args: Schema.Struct({
    /** The stack's id, unique in the document. */
    id: Schema.String,
    /** Default `bottom-end`. */
    position: Schema.optionalKey(Position),
    /** The page's direction: a swipe goes toward the edge. Default `ltr`. */
    direction: Schema.optionalKey(Schema.Literals(['ltr', 'rtl'])),
    /** A toast's duration in milliseconds unless it gives one. Default 4000. */
    duration: Schema.optionalKey(Schema.Number),
    /** How many show at once. Default 3. */
    max: Schema.optionalKey(Schema.Number),
    /** How far a swipe goes before it dismisses, in pixels. Default 45. */
    threshold: Schema.optionalKey(Schema.Number),
  }),
  init: ({ id, ...options }) => ({ model: init(id, options) }),
  update,
  helpers: { show, settle, dismiss },
})
