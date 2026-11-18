import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../inputCopy.js'

/**
 * An InputCopy's state for `foldkit-bundle`: whether the value shows as
 * copied and for how long, `InputCopy.init` and `update` packaged. Answer the
 * button's `onCopy` with `InputCopy.Copy`, and fold the `ClipboardMessage` it
 * yields into this Bundle's `Copied` and `Failed`. It holds no view: draw the
 * placed Model with `InputCopy.view`.
 */
export const InputCopy = Bundle.make('InputCopy', {
  Model,
  Message,
  args: Schema.Struct({ resetAfter: Schema.optionalKey(Schema.Number) }),
  init: args => ({ model: init(args) }),
  update,
})
