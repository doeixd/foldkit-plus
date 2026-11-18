import * as UiListbox from '@foldkit/ui/listbox'
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { ChoiceChange } from '../choice.js'
import { Multi, create } from '../listboxView.js'

const single = create<string>()
const multiple = Multi.create<string>()

/**
 * A Listbox's interaction state for `foldkit-bundle`: whether it is open, the
 * row the keys are on, the typeahead. It never holds the value, which is the
 * application's: answer its `ChoiceChange` in `onOut` through the `Choice`
 * the view is given (`Fruit.picked(model.fruit, out)`). It holds no view.
 *
 * `multiple` is read by `update` (choosing leaves a multiple listbox open and
 * flips the item), so it is an arg and must agree with the choice: `true` for
 * `Listbox.many`, absent for `Listbox.one`.
 */
export const Listbox = Bundle.make('Listbox', {
  Model: UiListbox.Model,
  Message: UiListbox.Message,
  args: Schema.Struct({
    /** Prefixes every id the listbox draws, unique on the page. */
    id: Schema.String,
    multiple: Schema.optionalKey(Schema.Boolean),
    /** Waits for the panel's CSS transition as it opens and closes. */
    animated: Schema.optionalKey(Schema.Boolean),
    /** Locks the page's scroll and makes the rest inert while open. */
    modal: Schema.optionalKey(Schema.Boolean),
    /** The arrows that move through the rows. */
    orientation: Schema.optionalKey(UiListbox.Orientation),
  }),
  init: ({ animated, modal, multiple: _, ...rest }) => ({
    model: UiListbox.init({
      ...rest,
      ...(animated === undefined ? {} : { isAnimated: animated }),
      ...(modal === undefined ? {} : { isModal: modal }),
    }),
  }),
  update: (model, message, args) => {
    const result =
      args.multiple === true ? multiple.update(model, message) : single.update(model, message)
    return {
      model: result.model,
      ...(result.commands === undefined ? {} : { commands: result.commands }),
      ...Option.match(Option.fromNullishOr(result.outMessage), {
        onNone: () => ({}),
        onSome: ({ value }) => ({ outMessage: ChoiceChange.Selected({ value }) }),
      }),
    }
  },
})
