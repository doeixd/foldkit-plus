import { Capability, Slot, Slots, Style } from 'foldkit-mixins'

const Contract = Slots.define({ row: Slot.make({ capability: Capability.Container }) })

export const Rows = Style.forSlots(Contract)({ row: Style.stagger({ stepMs: 20 }) })
