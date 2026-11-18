import * as UiDialog from '@foldkit/ui/dialog'
import { Schema } from 'effect'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { close, isDismissal, open, update } from '../dialog.js'

type Step = ReturnWithOutMessage<UiDialog.Model, UiDialog.Message, UiDialog.OutMessage>

const step = (
  model: UiDialog.Model,
  message: UiDialog.Message,
  { dismissible }: { readonly dismissible?: boolean | undefined },
): Step =>
  dismissible === false && isDismissal(message) ? { model, commands: [] } : update(model, message)

/**
 * A Dialog's state for `foldkit-bundle`: upstream's open flag, its animation
 * and its focus target, with `id`, `isAnimated` and `focusSelector` as the
 * args, plus `dismissible`. It reports `Opened` and `Closed` in `onOut`; the
 * application's own state follows from those.
 *
 * With `dismissible: false` (an alert dialog's) Escape, a press on the
 * backdrop and the close button send `RequestedClose` and the Bundle drops
 * it: only the answers close it, through the placement's `helpers.close`.
 * It holds no view: draw the placed Model with `Dialog.toView`.
 */
export const Dialog = Bundle.make('Dialog', {
  Model: UiDialog.Model,
  Message: UiDialog.Message,
  args: Schema.Struct({
    /** Unique in the document: it keys the element and its ARIA references. */
    id: Schema.String,
    /** Keeps the dialog drawn while it leaves, so a recipe's fade runs. Default true. */
    isAnimated: Schema.optionalKey(Schema.Boolean),
    /** The element that takes focus on open, by selector, ahead of `initialFocus`. */
    focusSelector: Schema.optionalKey(Schema.String),
    /** Whether Escape, the backdrop and the close button close it. Default true. */
    dismissible: Schema.optionalKey(Schema.Boolean),
  }),
  init: ({ dismissible: _, ...config }) => ({ model: UiDialog.init(config) }),
  update: step,
  helpers: {
    /** Opens it, as a button of the application's does. */
    open,
    /** Closes it whatever `dismissible` says: the answer of an alert dialog. */
    close,
  },
})
