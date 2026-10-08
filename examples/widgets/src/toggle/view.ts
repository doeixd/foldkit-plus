/**
 * The toggle as one SlotView: `ToggleState` writes `aria-pressed` from the
 * parent's boolean, the view's click flips it. No Bundle — one boolean needs
 * no placement.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Message, initial, update, type Model } from './app.js'
import { toggleStyle } from '../style.js'

export const ToggleSlots = Slots.define({
  control: Slot.make({ capability: Capability.Interactive }),
})

const Pressed = Behaviors.ToggleState.behavior(ToggleSlots)<Model, Message>({
  control: 'control',
  state: input => input.on,
  as: 'pressed',
})

export const Toggle = SlotView.forMessages<Message>()
  .define(ToggleSlots, (model: Model, slots, h) =>
    h.button(slots.control.attrs([h.AriaLabel('Mute'), h.OnClick(Message.Toggled())]), [
      model.on ? 'Muted' : 'Mute',
    ]),
  )
  .pipe(Behavior.attach(Pressed), Style.attach(toggleStyle(ToggleSlots)))

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: on=${model.on}`]
  model = update(model, Message.Toggled()).model
  lines.push(`toggled: on=${model.on}`)
  return lines
}
