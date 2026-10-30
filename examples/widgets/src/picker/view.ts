/**
 * The sort Picker, styled by `foldkit-mixins-ui`'s recipes: below the
 * theme's `md` breakpoint its opener shows the options in a Sheet, above it
 * a Listbox drops them down. One line beside it says what the application
 * holds, so either way of choosing shows the same result.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { DialogSlots, ListboxSlots, Picker, PickerSlots, Recipes } from 'foldkit-mixins-ui'
import { pickerIslandStyle } from '../style.js'
import { textOf } from '../text.js'
import { LABELS, Message, OPTIONS, initial, update, type Model } from './app.js'

export const PickerIslandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  result: Slot.make({ capability: Capability.Container }),
})

const style = Style.forSlots(PickerSlots)(Recipes.Picker({}))
const listbox = Style.forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger' }))
const sheet = Style.forSlots(DialogSlots)(Recipes.Sheet({}))
const layout = pickerIslandStyle(PickerIslandSlots)

/** The styles the island draws with, for the page's sheet. */
export const pickerStyles = [layout, style, listbox, sheet] as const

export const PickerIsland = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PickerIslandSlots, [layout.mixin], { input: undefined, h })
  return h.div(slots.root.attrs(), [
    Picker.view(
      {
        model: model.picker,
        onMessage: message => Message.GotPicker({ message }),
        label: 'Sort',
        options: OPTIONS,
        value: model.sort,
        placeholder: 'Sort by',
        style,
        listbox: [listbox.mixin],
        sheet: [sheet.mixin],
      },
      h,
    ),
    h.p(slots.result.attrs([h.AriaLive('polite')]), [
      `Sorted by: ${Option.match(model.sort, { onNone: () => 'nothing yet', onSome: sort => LABELS[sort] })}`,
    ]),
  ])
}

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: sort=${textOf(model.sort)}`]
  model = update(model, Message.GotPicker({ message: Picker.Message.OpenedSheet() })).model
  lines.push(`opened the sheet: open=${model.picker.sheet.dialog.isOpen}`)
  model = update(
    model,
    Message.GotPicker({ message: Picker.Message.ChoseInSheet({ value: 'price' }) }),
  ).model
  lines.push(
    `chose in the sheet: sort=${textOf(model.sort)} open=${model.picker.sheet.dialog.isOpen}`,
  )
  return lines
}
