import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../passwordInput.js'

/**
 * A PasswordInput's state for `foldkit-bundle`: whether the password shows
 * and whether Caps Lock is on, `PasswordInput.init` and `update` packaged.
 * The text is the application's own field. It holds no view: draw the placed
 * Model with `PasswordInput.view`, spreading `PasswordInput.controls`.
 */
export const PasswordInput = Bundle.make('PasswordInput', {
  Model,
  Message,
  args: Schema.Struct({ visible: Schema.optionalKey(Schema.Boolean) }),
  init: args => ({ model: init(args) }),
  update,
})
