import { Bundle } from 'foldkit-bundle'
import { Args, Message, Model, init, update } from '../accordion/state.js'

/**
 * An Accordion's open sections for `foldkit-bundle`, with `multiple` and
 * `collapsible` as the args, stated once and kept for every press. A parent
 * reads the open ids from the placed Model (`model.faq.open`). It holds no
 * view: draw the placed Model with `Accordion.view`, spreading
 * `Accordion.controls`.
 */
export const Accordion = Bundle.make('Accordion', {
  Model,
  Message,
  args: Args,
  init: args => ({ model: init(args) }),
  update,
})
