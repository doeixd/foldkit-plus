import * as UiPopover from '@foldkit/ui/popover'
import { Schema } from 'effect'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

type Step = ReturnWithOutMessage<UiPopover.Model, UiPopover.Message, UiPopover.OutMessage>

const step = (model: UiPopover.Model, message: UiPopover.Message): Step =>
  UiPopover.update(model, message)

/**
 * A Popover's state for `foldkit-bundle`: upstream's open flag, animation and
 * focus, with `UiPopover.init`'s options as the args. It reports `Opened` and
 * `Closed` in `onOut`; `helpers.close` shuts it from a control inside the
 * panel. It holds no view: draw the placed Model with `Popover.toView`.
 */
export const Popover = Bundle.make('Popover', {
  Model: UiPopover.Model,
  Message: UiPopover.Message,
  args: Schema.Struct({
    /** Unique in the document: the button, panel and arrow ids derive from it. */
    id: Schema.String,
    /** Keeps the panel drawn while it leaves, so a recipe's fade runs. */
    isAnimated: Schema.optionalKey(Schema.Boolean),
    /** Locks page scroll and makes the rest of the page inert while open. */
    isModal: Schema.optionalKey(Schema.Boolean),
    /** The panel has no tab stop and focus leaving it does not close it. */
    contentFocus: Schema.optionalKey(Schema.Boolean),
  }),
  init: args => ({ model: UiPopover.init(args) }),
  update: step,
  helpers: { open: UiPopover.open, close: UiPopover.close },
})
