import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Color, Format, Message, Model, init, update } from '../colorPicker.js'

const OutMessage = defineMessageUnion({
  /** The picker holds another color; the Bundle owns it and says so. */
  Changed: { color: Color },
})

/**
 * A ColorPicker's state for `foldkit-bundle`: the color, the format it is
 * written in and the text being typed, with `ColorPicker.init`'s options as
 * the args. The color is the picker's own value, so the Bundle holds it and
 * reports `Changed` when it holds another; a parent that only reads
 * `model.<field>.color` answers with `Bundle.ignore`. It holds no view: draw
 * the placed Model with `ColorPicker.view`, or `ColorPicker.popover` beside
 * `Bundles.Popover`.
 */
export const ColorPicker = Bundle.make('ColorPicker', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the picker draws, unique on the page. */
    id: Schema.String,
    /** Default an opaque blue. */
    color: Schema.optionalKey(Color),
    /** How the text field writes it. Default `hex`. */
    format: Schema.optionalKey(Format),
  }),
  init: args => ({ model: init(args) }),
  update: (model, message) => {
    const next = update(model, message)
    const { color: before } = model
    const { color: after } = next.model
    const changed =
      before.h !== after.h ||
      before.s !== after.s ||
      before.v !== after.v ||
      before.alpha !== after.alpha
    return changed ? { ...next, outMessage: OutMessage.Changed({ color: after }) } : next
  },
})
