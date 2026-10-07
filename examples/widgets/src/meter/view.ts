/**
 * The meter as one plain SlotView: the `<meter>` element with value, min,
 * max, and a label carries the whole contract — no Bundle, no Behavior.
 * This is the trivial end the matrix names: value/max attributes.
 */
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Message, QUOTA, clamp, initial, update, type Model } from './app.js'

export const MeterSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  less: Slot.make({ capability: Capability.Interactive }),
  more: Slot.make({ capability: Capability.Interactive }),
})

export const Meter = SlotView.forMessages<Message>()
  .define(MeterSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.label(
        [],
        [
          'Storage',
          h.meter(
            [h.Value(String(model.used)), h.Min('0'), h.Max(String(QUOTA))],
            [`${model.used} of ${QUOTA} GB`],
          ),
        ],
      ),
      h.button(slots.less.attrs([h.OnClick(Message.SetUsed({ used: clamp(model.used - 10) }))]), [
        'Free 10',
      ]),
      h.button(slots.more.attrs([h.OnClick(Message.SetUsed({ used: clamp(model.used + 10) }))]), [
        'Use 10',
      ]),
    ]),
  )
  .pipe()

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: used=${model.used}`]
  model = update(model, Message.SetUsed({ used: 200 })).model
  lines.push(`set 200: used=${model.used} (clamped)`)
  return lines
}
