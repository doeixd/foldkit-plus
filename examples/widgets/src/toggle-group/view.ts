/**
 * The group as one SlotView: `Selection` writes `aria-selected` and wires
 * each option's click; the view adds `aria-pressed` from the same selected
 * set, since a toggle group's options are pressables that read selected.
 * `ToggleState` stays out: it names one control, not one per item.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Selection } from 'foldkit-primitives/interaction'
import { toggleGroupStyle } from '../style.js'
import {
  OPTIONS,
  Sel,
  initial,
  selArgs,
  selectedOf,
  textOf,
  update,
  type Message,
  type Model,
} from './app.js'

export const ToggleGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  option: Slot.make({ capability: Capability.Interactive }),
})

const describeOptions = () =>
  Behaviors.Collection.of(OPTIONS, {
    id: option => option,
  })

const Ids = Behaviors.Collection.behavior(ToggleGroupSlots)<Model, Message>({
  item: 'option',
  items: () => describeOptions(),
})

const Picks = Selection.behavior(Sel, selArgs)(ToggleGroupSlots)<Model, Message>({
  container: 'root',
  item: 'option',
  items: () => describeOptions(),
})

export const ToggleGroup = SlotView.forMessages<Message>()
  .define(ToggleGroupSlots, (model: Model, slots, h) => {
    const items = describeOptions()
    const selected = selectedOf(model)
    return h.div(
      slots.root.attrs([h.Role('group'), h.AriaLabel('Text alignment')]),
      OPTIONS.map((option, index) =>
        h.button(
          slots.option.attrs(
            [
              h.Key(option),
              h.AriaPressed(
                Option.isSome(selected) && selected.value === option ? 'true' : 'false',
              ),
            ],
            items.slotItem(index),
          ),
          [option],
        ),
      ),
    )
  })
  .pipe(
    Behavior.attach(Ids),
    Behavior.attach(Picks),
    Style.attach(toggleGroupStyle(ToggleGroupSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const lines = [`start: selected=${textOf(selectedOf(model))}`]
  model = update(model, Sel.wrapper.make(Selection.Message.Activated({ id: 'center' }))).model
  lines.push(`picked center: selected=${textOf(selectedOf(model))}`)
  model = update(model, Sel.wrapper.make(Selection.Message.Activated({ id: 'center' }))).model
  lines.push(`picked center again: selected=${textOf(selectedOf(model))}`)
  return lines
}
