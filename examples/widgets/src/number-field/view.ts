/**
 * The field as one SlotView: `SpinValue` writes the spinbutton role, its
 * `aria-value*`, and the arrow/page/home/end keys; `FieldAssociation` ties
 * the control to its label and description with derived ids. The +/- buttons
 * are plain clicks through the same clamped `SetValue`.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { numberFieldStyle } from '../style.js'
import { BOUNDS, Message, clamp, initial, update, type Model } from './app.js'

export const NumberFieldSlots = Slots.define({
  control: Slot.make({ capability: Capability.Focusable }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  increment: Slot.make({ capability: Capability.Interactive }),
  decrement: Slot.make({ capability: Capability.Interactive }),
})

const Spin = Behaviors.SpinValue.behavior(NumberFieldSlots)<Model, Message>({
  control: 'control',
  value: input => input.value,
  onChange: next => Message.SetValue({ value: next }),
  ...BOUNDS,
})

const Associated = Behaviors.FieldAssociation.behavior(NumberFieldSlots)<Model, Message>({
  control: 'control',
  label: 'label',
  description: 'description',
  id: () => 'quantity',
  required: () => true,
})

export const NumberField = SlotView.forMessages<Message>()
  .define(NumberFieldSlots, (model: Model, slots, h) =>
    h.div(
      [],
      [
        h.label(slots.label.attrs(), ['Quantity']),
        h.div(slots.control.attrs([h.Tabindex(0)]), [String(model.value)]),
        h.p(slots.description.attrs(), ['Servings, 0 to 10.']),
        h.button(
          slots.decrement.attrs([h.OnClick(Message.SetValue({ value: clamp(model.value - 1) }))]),
          ['−'],
        ),
        h.button(
          slots.increment.attrs([h.OnClick(Message.SetValue({ value: clamp(model.value + 1) }))]),
          ['+'],
        ),
      ],
    ),
  )
  .pipe(
    Behavior.attach(Spin),
    Behavior.attach(Associated),
    Style.attach(numberFieldStyle(NumberFieldSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: value=${model.value}`]
  model = update(model, Message.SetValue({ value: 11 })).model
  lines.push(`set 11: value=${model.value} (clamped)`)
  model = update(model, Message.SetValue({ value: 0 })).model
  lines.push(`set 0: value=${model.value}`)
  return lines
}
