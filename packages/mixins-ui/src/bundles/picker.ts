import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { ChoiceChange } from '../choice.js'
import { Message, Model, OutMessage, init, update } from '../picker.js'

/**
 * A Picker's interaction state for `foldkit-bundle`: the dropdown's open list
 * and highlight, and the phone's Sheet, one Model and one set of Messages
 * whatever the width. It never holds the value, which is the application's:
 * answer its `ChoiceChange` in `onOut` through the `Choice` the view is given
 * (`Sort.picked(model.sort, out)`), a choice made in either half arriving the
 * same. The Sheet's `swipe` is not an arg; `Picker.init` takes it. It holds
 * no view.
 */
export const Picker = Bundle.make('Picker', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the picker draws, unique on the page. */
    id: Schema.String,
    /** How much of the phone's Sheet shows at each resting point, ascending in (0, 1]. Default `[1]`. */
    points: Schema.optionalKey(Schema.Array(Schema.Number)),
    /** The index in `points` the Sheet opens at. Default 0. */
    opensAt: Schema.optionalKey(Schema.Number),
    /** Whether a drag may take the Sheet away. Default true. */
    dismissible: Schema.optionalKey(Schema.Boolean),
    /** Whether the Sheet slides in and out. Default true. */
    animated: Schema.optionalKey(Schema.Boolean),
  }),
  init: ({ id, animated, ...sheet }) => ({
    model: init({
      id,
      sheet: { ...sheet, ...(animated === undefined ? {} : { isAnimated: animated }) },
    }),
  }),
  update: (model, message) => {
    const result = update(model, message)
    return {
      model: result.model,
      ...(result.commands === undefined ? {} : { commands: result.commands }),
      ...(result.outMessage === undefined
        ? {}
        : {
            outMessage: OutMessage.match(result.outMessage, {
              Chose: ({ value }) => ChoiceChange.Selected({ value }),
            }),
          }),
    }
  },
})
