import { Bundle } from 'foldkit-bundle'
import type { Selection } from '../calendar/selection.js'
import { Args, Message, Model, init, set, update } from '../datePicker/state.js'

/**
 * A DatePicker's state for `foldkit-bundle`: upstream's picker (its popover
 * and its calendar), the selection and a range's preview, with
 * `DatePicker.init`'s options as the args. As the Calendar's Bundle does, it
 * holds the selection and reports `Changed` when it holds other days. The
 * `closes` arg says whether the pick that makes the selection whole closes
 * the popover (`complete`, the default) or none does (`manual`). It holds no
 * view: draw the placed Model with `DatePicker.view`.
 */
export const DatePicker = Bundle.make('DatePicker', {
  Model,
  Message,
  args: Args,
  init: args => ({ model: init(args) }),
  update: (model, message) => update(model, message),
  helpers: {
    /** Sets the selection from the parent, turning the month to its first day; reports nothing. */
    set: (model: Model, selection: Selection) => ({ model: set(model, selection) }),
  },
})
