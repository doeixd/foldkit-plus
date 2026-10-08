/**
 * The upload as one plain SlotView: the `<progress>` element with value and
 * max carries the whole contract — no Bundle, no Behavior. An unknown total
 * omits `value`, which is the native indeterminate; the label still reads
 * what is known.
 */
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { progressStyle } from '../style.js'
import { Message, TOTAL, clamp, initial, update, type Model } from './app.js'

export const ProgressSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  bar: Slot.make({ capability: Capability.Container }),
  less: Slot.make({ capability: Capability.Interactive }),
  more: Slot.make({ capability: Capability.Interactive }),
  unknown: Slot.make({ capability: Capability.Interactive }),
})

export const Progress = SlotView.forMessages<Message>()
  .define(ProgressSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.label(
        [],
        [
          'Upload',
          model.known === true
            ? h.progress(slots.bar.attrs([h.Value(String(model.sent)), h.Max(String(TOTAL))]), [
                `${model.sent} of ${TOTAL} MB`,
              ])
            : h.progress(slots.bar.attrs([]), ['Sending…']),
        ],
      ),
      h.button(slots.less.attrs([h.OnClick(Message.SetSent({ sent: clamp(model.sent - 10) }))]), [
        'Back 10',
      ]),
      h.button(slots.more.attrs([h.OnClick(Message.SetSent({ sent: clamp(model.sent + 10) }))]), [
        'Send 10',
      ]),
      h.button(slots.unknown.attrs([h.OnClick(Message.SetKnown({ known: !model.known }))]), [
        model.known === true ? 'Lose total' : 'Find total',
      ]),
    ]),
  )
  .pipe(Style.attach(progressStyle(ProgressSlots)))

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: sent=${model.sent}`]
  model = update(model, Message.SetSent({ sent: 200 })).model
  lines.push(`send 200: sent=${model.sent} (clamped)`)
  model = update(model, Message.SetKnown({ known: false })).model
  lines.push(`total lost: known=${model.known}`)
  return lines
}
