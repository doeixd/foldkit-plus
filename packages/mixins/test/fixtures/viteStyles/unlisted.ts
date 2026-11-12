import { Capability, Slot, Slots, Style } from 'foldkit-mixins'

const Contract = Slots.define({ root: Slot.make({ capability: Capability.Container }) })

/** A Style no `modules` entry lists, so the build draws it with the compiler. */
export const Unlisted = Style.forSlots(Contract)({ root: Style.self({ color: 'rgb(9, 8, 7)' }) })
