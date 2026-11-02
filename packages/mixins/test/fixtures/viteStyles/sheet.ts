import { Style } from 'foldkit-mixins'
import { Layers } from 'foldkit-mixins'
import { Capability, Slot, Slots } from 'foldkit-mixins'
import './outside.js'

const L = Layers.standard
const Slotted = Slots.define({ root: Slot.make({ capability: Capability.Container }) })

export const Look = Style.forSlots(Slotted)(
  { root: Style.self({ color: 'rgb(1, 2, 3)' }) },
  { name: 'Look', layer: L.layer('app') },
)

export const stylesheet = Style.stylesheet(L.declare, Look)
