/**
 * The preference as one plain SlotView: the `<select>` element with value
 * and change carries the whole contract — no Bundle, no Behavior. The
 * browser owns the dropdown; this owns the options and the readout naming
 * the chosen channel.
 */
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { nativeSelectStyle } from '../style.js'
import { CHANNELS, Message, initial, update, type Model } from './app.js'

export const NativeSelectSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  field: Slot.make({ capability: Capability.Interactive }),
})

export const NativeSelect = SlotView.forMessages<Message>()
  .define(NativeSelectSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.label(
        [],
        [
          'Reach me by',
          h.select(
            slots.field.attrs([
              h.Value(model.value),
              h.OnChange(value => Message.SetValue({ value })),
            ]),
            [...CHANNELS.map(channel => h.option([h.Value(channel)], [channel]))],
          ),
        ],
      ),
      h.p([], [`Chosen: ${model.value}.`]),
    ]),
  )
  .pipe(Style.attach(nativeSelectStyle(NativeSelectSlots)))

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: value=${model.value}`]
  model = update(model, Message.SetValue({ value: 'phone' })).model
  lines.push(`picked phone: value=${model.value}`)
  model = update(model, Message.SetValue({ value: 'pager' })).model
  lines.push(`picked pager: value=${model.value} (refused)`)
  return lines
}
