/**
 * Compile-time contract of `Anchor.behavior`: it takes a `SlotView.over`
 * binder, which types `config`'s input, or the slots with the types named.
 * Type-checked, not executed.
 */
import { Capability, Slot, SlotView, Slots } from 'foldkit-mixins'
import { Anchor } from '../src/index.js'

const MenuSlots = Slots.define({
  button: Slot.make({ capability: Capability.Interactive }),
  panel: Slot.make({ capability: Capability.Container }),
})

interface Input {
  readonly id: string
}
type Message = { readonly _tag: 'Opened' }

const Menu = SlotView.over(MenuSlots)<Input, Message>()

// Over a binder the input is inferred, with nothing annotated.
Anchor.behavior(Menu)({
  floating: 'panel',
  config: input => ({ buttonId: `${input.id}-button`, anchor: {} }),
})

// Over the slots, the two types are named.
Anchor.behavior(MenuSlots)<Input, Message>({
  floating: 'panel',
  config: input => ({ buttonId: input.id, anchor: {} }),
})

Anchor.behavior(Menu)({
  // @ts-expect-error -- `Menu` has no slot `popup`
  floating: 'popup',
  config: () => ({ buttonId: 'x', anchor: {} }),
})

Anchor.behavior(Menu)({
  floating: 'panel',
  // @ts-expect-error -- the binder's input has no `missing`
  config: input => ({ buttonId: input.missing, anchor: {} }),
})

// A binder is never read as slots: the slots overload refuses it.
// @ts-expect-error -- `Menu` is a binder, not a slot set
Anchor.behavior<typeof Menu>(Menu)
