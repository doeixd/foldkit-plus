import * as UiTooltip from '@foldkit/ui/tooltip'
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'

/**
 * A Tooltip's state for `foldkit-bundle`: upstream's hover and focus intent,
 * with `id` and `showDelay` (milliseconds) as the args. It reports `Shown`
 * and `Hidden` in `onOut`. It holds no view: draw the placed Model with
 * `Tooltip.toView`.
 */
export const Tooltip = Bundle.make('Tooltip', {
  Model: UiTooltip.Model,
  Message: UiTooltip.Message,
  args: Schema.Struct({
    /** Unique in the document: the trigger and panel ids derive from it. */
    id: Schema.String,
    /** How long the pointer rests before it shows, in milliseconds. */
    showDelay: Schema.optionalKey(Schema.Number),
  }),
  init: args => ({ model: UiTooltip.init(args) }),
  update: (model, message) => UiTooltip.update(model, message),
})
