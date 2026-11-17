import { Bundle } from 'foldkit-bundle'
import { Args, Message, Model, init, set, update } from '../calendar/state.js'
import type { Selection } from '../calendar/selection.js'

/**
 * A Calendar's state for `foldkit-bundle`: the month shown, a second month
 * where `months` is 2, the selection and a range's preview, with
 * `Calendar.init`'s options as the args. The selection is the Calendar's own
 * value, so the Bundle holds it and reports `Changed` when it holds other
 * days; a parent that only reads `model.<field>.selection` answers with
 * `Bundle.ignore`. The mode is the `selection` arg's tag
 * (`Calendar.empty('Range')`). It holds no view: draw the placed Model with
 * `Calendar.view`.
 */
export const Calendar = Bundle.make('Calendar', {
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
