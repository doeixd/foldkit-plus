import { Option, Schema } from 'effect'
import * as UiCombobox from '@foldkit/ui/combobox'
import { Bundle } from 'foldkit-bundle'
import { ChoiceChange } from '../choice.js'
import { Multi, create } from '../comboboxView.js'

const single = create<string>()
const multiple = Multi.create<string>()

const changeOf = (out: UiCombobox.OutMessage): ChoiceChange =>
  UiCombobox.OutMessage.match(out, {
    Selected: ({ value }) => ChoiceChange.Selected({ value }),
    ClearedSelection: () => ChoiceChange.ClearedSelection(),
  })

/**
 * A Combobox's interaction state for `foldkit-bundle`: whether it is open,
 * the row the keys are on, the text typed. It never holds the value, which
 * is the application's: answer its `ChoiceChange` in `onOut` through the
 * `Choice` the view is given (`City.picked(model.city, out)`). It holds no
 * view.
 *
 * `multiple` is read by `update` (choosing leaves a multiple combobox open
 * and flips the item), so it is an arg and must agree with the choice:
 * `true` for `Combobox.many`, absent for `Combobox.one` and `Combobox.text`.
 */
export const Combobox = Bundle.make('Combobox', {
  Model: UiCombobox.Model,
  Message: UiCombobox.Message,
  args: Schema.Struct({
    /** Prefixes every id the combobox draws, unique on the page. */
    id: Schema.String,
    multiple: Schema.optionalKey(Schema.Boolean),
    /** Emptying the field and leaving it clears the value (`ClearedSelection`). */
    nullable: Schema.optionalKey(Schema.Boolean),
    /** The arrows choose as they move, without Enter. */
    immediate: Schema.optionalKey(Schema.Boolean),
    /** Waits for the panel's CSS transition as it opens and closes. */
    animated: Schema.optionalKey(Schema.Boolean),
    /** Locks the page's scroll and makes the rest inert while open. */
    modal: Schema.optionalKey(Schema.Boolean),
    selectInputOnFocus: Schema.optionalKey(Schema.Boolean),
  }),
  init: ({ animated, modal, multiple: _, ...rest }) => ({
    model: UiCombobox.init({
      ...rest,
      ...(animated === undefined ? {} : { isAnimated: animated }),
      ...(modal === undefined ? {} : { isModal: modal }),
    }),
  }),
  update: (model, message, args) => {
    const result =
      args.multiple === true ? multiple.update(model, message) : single.update(model, message)
    const typed =
      result.model.inputValue === model.inputValue
        ? Option.none()
        : Option.some(ChoiceChange.Typed({ text: result.model.inputValue }))
    // What was chosen says more than the text that followed it.
    const change = Option.orElse(
      Option.map(Option.fromNullishOr(result.outMessage), changeOf),
      () => typed,
    )
    return {
      model: result.model,
      ...(result.commands === undefined ? {} : { commands: result.commands }),
      ...Option.match(change, { onNone: () => ({}), onSome: outMessage => ({ outMessage }) }),
    }
  },
})
