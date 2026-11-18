import { Bundle } from 'foldkit-bundle'
import { Args, Message, Model, init, update } from '../thinkingSteps/state.js'

/**
 * A trace's openness for `foldkit-bundle`: whether the reader opened or shut
 * it (none follows the work) and which steps' details are open, with
 * `multiple` as the arg, stated once. Draw the placed Model with
 * `ThinkingSteps.view`, spreading `ThinkingSteps.controls`.
 */
export const ThinkingSteps = Bundle.make('ThinkingSteps', {
  Model,
  Message,
  args: Args,
  init: args => ({ model: init(args) }),
  update,
})
