import * as UiHoverIntent from '@foldkit/ui/hoverIntent'
import { Schema } from 'effect'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

type Step = ReturnWithOutMessage<
  UiHoverIntent.Model,
  UiHoverIntent.Message,
  UiHoverIntent.OutMessage
>

const step = (model: UiHoverIntent.Model, message: UiHoverIntent.Message): Step =>
  UiHoverIntent.update(model, message)

/**
 * A HoverCard's state for `foldkit-bundle`: upstream's HoverIntent, which
 * opens and closes after delays so the card does not flicker, with
 * `openDelay` and `closeDelay` (milliseconds) as the args. It reports
 * `Opened` and `Closed` in `onOut`; `helpers.close` shuts it at once. It
 * holds no view: draw the placed Model with `HoverIntent.toView`.
 */
export const HoverIntent = Bundle.make('HoverIntent', {
  Model: UiHoverIntent.Model,
  Message: UiHoverIntent.Message,
  args: Schema.Struct({
    /** Default 200. */
    openDelay: Schema.optionalKey(Schema.Number),
    /** Default 300. */
    closeDelay: Schema.optionalKey(Schema.Number),
  }),
  init: args => ({ model: UiHoverIntent.init(args) }),
  update: step,
  helpers: { close: UiHoverIntent.close },
})
