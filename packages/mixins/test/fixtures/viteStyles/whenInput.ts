import { Capability, Slot, Slots, Style } from 'foldkit-mixins'

const Contract = Slots.define({ root: Slot.make({ capability: Capability.Container }) })

export const Toggle = Style.forSlots(Contract)({
  root: Style.whenInput((input: { readonly on: boolean }) => input.on, { color: 'red' }),
})
