/**
 * The stepper as one SlotView. Each button is a `Repeat` placement on a slot of
 * its own, since a slot takes one Mount of the press family; neither writes
 * the value, which is drawn from the Model.
 */
import { Behavior, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Repeat } from 'foldkit-primitives/interaction'
import { control, focus, t } from '../style.js'
import { Less, MAX, MIN, More, type Message, type Model } from './app.js'

export const StepperSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  less: Slot.make({ capability: Capability.Interactive }),
  value: Slot.make({ capability: Capability.Container }),
  more: Slot.make({ capability: Capability.Interactive }),
})

const Stepper = SlotView.over(StepperSlots)<Model, Message>()

export const LessRepeats = Repeat.behavior(Less)(Stepper)({
  target: 'less',
  disabled: model => model.value <= MIN,
})
export const MoreRepeats = Repeat.behavior(More)(Stepper)({
  target: 'more',
  disabled: model => model.value >= MAX,
})

export const StepperStyle = Style.forSlots(StepperSlots)(
  {
    root: Style.self({ display: 'inline-flex', alignItems: 'center', gap: t.space.xs }),
    less: Style.compose(
      control,
      focus,
      Style.self({ touchAction: 'manipulation', userSelect: 'none' }),
    ),
    value: Style.self({
      minInlineSize: '4ch',
      textAlign: 'center',
      fontVariantNumeric: 'tabular-nums',
    }),
    more: Style.compose(
      control,
      focus,
      Style.self({ touchAction: 'manipulation', userSelect: 'none' }),
    ),
  },
  { name: 'StepperStyle' },
)

export const NumberStepper = Stepper.define((model, slots, h) =>
  h.div(slots.root.attrs([h.Role('group'), h.AriaLabel('Quantity')]), [
    h.button(slots.less.attrs([h.Type('button'), h.AriaLabel('Less')]), ['−']),
    h.output(slots.value.attrs([h.AriaLive('polite')]), [String(model.value)]),
    h.button(slots.more.attrs([h.Type('button'), h.AriaLabel('More')]), ['+']),
  ]),
).pipe(Behavior.attach(LessRepeats), Behavior.attach(MoreRepeats), Style.attach(StepperStyle))
