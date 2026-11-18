import { Bundle } from 'foldkit-bundle'
import { Args, Message, Model, init, update } from '../disclosure/state.js'

/**
 * A Disclosure's open flag for `foldkit-bundle`, with `isOpen` as the arg for
 * how it starts. `@foldkit/ui`'s disclosure is stateless, so the flag is this
 * Bundle's own. A parent reads it from the placed Model (`model.details.isOpen`).
 * It holds no view: draw the placed Model with `Disclosure.view`, spreading
 * `Disclosure.controls`.
 */
export const Disclosure = Bundle.make('Disclosure', {
  Model,
  Message,
  args: Args,
  init: args => ({ model: init(args) }),
  update,
})
