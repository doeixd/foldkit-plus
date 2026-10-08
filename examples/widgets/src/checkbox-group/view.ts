/**
 * The group as one SlotView: `Selection` writes `aria-multiselectable` on
 * the group and wires each option's click; the view draws a native checkbox
 * per option, checked from the same selected set. The `<fieldset>` legend
 * is the floor — no association behavior needed to name the group.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Selection } from 'foldkit-primitives/interaction'
import { checkboxGroupStyle } from '../style.js'
import {
  TOPPINGS,
  Sel,
  initial,
  selArgs,
  selectedOf,
  update,
  type Message,
  type Model,
} from './app.js'

export const CheckboxGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  option: Slot.make({ capability: Capability.Interactive }),
})

const describeToppings = () =>
  Behaviors.Collection.of(TOPPINGS, {
    id: topping => topping,
  })

const Ids = Behaviors.Collection.behavior(CheckboxGroupSlots)<Model, Message>({
  item: 'option',
  items: () => describeToppings(),
})

const Picks = Selection.behavior(Sel, selArgs)(CheckboxGroupSlots)<Model, Message>({
  container: 'root',
  item: 'option',
  items: () => describeToppings(),
})

export const CheckboxGroup = SlotView.forMessages<Message>()
  .define(CheckboxGroupSlots, (model: Model, slots, h) => {
    const items = describeToppings()
    const selected = new Set(selectedOf(model))
    return h.fieldset(slots.root.attrs([h.Role('group'), h.AriaLabel('Toppings')]), [
      h.legend([], ['Toppings']),
      ...TOPPINGS.map((topping, index) =>
        h.label(slots.option.attrs([h.Key(topping)], items.slotItem(index)), [
          h.input([h.Type('checkbox'), h.Checked(selected.has(topping)), h.AriaLabel(topping)]),
          topping,
        ]),
      ),
    ])
  })
  .pipe(
    Behavior.attach(Ids),
    Behavior.attach(Picks),
    Style.attach(checkboxGroupStyle(CheckboxGroupSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const lines = [`start: selected=${selectedOf(model).join(',')}`]
  model = update(model, Sel.wrapper.make(Selection.Message.Activated({ id: 'cheese' }))).model
  lines.push(`picked cheese: selected=${selectedOf(model).join(',')}`)
  model = update(model, Sel.wrapper.make(Selection.Message.Activated({ id: 'mushrooms' }))).model
  lines.push(`picked mushrooms: selected=${selectedOf(model).join(',')}`)
  return lines
}
