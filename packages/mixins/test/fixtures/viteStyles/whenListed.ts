import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { isOn } from './listedPredicate.js'

const Contract = Slots.define({ root: Slot.make({ capability: Capability.Container }) })

export const Toggle = Style.forSlots(Contract)({
  root: Style.whenInput(isOn, { color: 'red' }),
})
