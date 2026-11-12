import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { isOn } from './predicate.js'

const Contract = Slots.define({ row: Slot.make({ capability: Capability.Container }) })

/** A per-item piece behind a predicate that would otherwise be kept. */
export const Rows = Style.forSlots(Contract)({
  row: Style.whenInput(isOn, Style.stagger({ stepMs: 20 })),
})
