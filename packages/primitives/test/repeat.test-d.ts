/**
 * Compile-time contract of `Repeat.behavior`, as `Press.behavior`'s: given a
 * `SlotView.over` binder it infers the input and the Message with nothing
 * annotated, supplies `activation` on the target slot it was given, and
 * refuses a slot or an input field that does not exist; bare slots with the
 * generics named still compile. Type-checked, not executed.
 */
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Capability, Slot, SlotView, Slots } from 'foldkit-mixins'
import { Repeat } from '../src/interaction/index.js'

const Hold = Bundle.declare(Repeat.bundle, 'hold')
const Message = defineMessageUnion({ ...Hold.cases })
type Message = typeof Message.Type
const StepperSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  more: Slot.make({ capability: Capability.Interactive }),
})
interface Input {
  readonly hold: Repeat.Model
  readonly value: number
}
const Stepper = SlotView.over(StepperSlots)<Input, Message>()

// Nothing annotated: `input` is the binder's, and `activation` is supplied on `more`.
const More = Repeat.behavior(Hold)(Stepper)({ target: 'more', disabled: input => input.value >= 3 })
const _supplies: Behavior.NamedBehavior<typeof StepperSlots, Input, Message, 'more/activation'> =
  More
void _supplies

// Bare slots, generics named.
const Bare = Repeat.behavior(Hold)(StepperSlots)<Input, Message>({ target: 'more' })
void Bare

Repeat.behavior(Hold)(Stepper)({
  // @ts-expect-error a slot the contract does not publish.
  target: 'nope',
})

Repeat.behavior(Hold)(Stepper)({
  target: 'more',
  // @ts-expect-error a field the input lacks.
  disabled: input => input.missing > 0,
})

const NoHold = SlotView.over(StepperSlots)<{ readonly value: number }, Message>()
// @ts-expect-error a binder whose input lacks the placed slice.
Repeat.behavior(Hold)(NoHold)
