import { Capability, Layers, Slot, Slots, Style } from 'foldkit-mixins'

const Slotted = Slots.define({ root: Slot.make({ capability: Capability.Container }) })

/** A global rule that class needs, so the sheet must carry it too. */
export const OUTSIDE_GLOBAL = '@layer app{.outside-global{color:rgb(4, 5, 6)}}'

/** Compiled when the module loads, and in no sheet: only `complete` finds it. */
export const Outside = Style.forSlots(Slotted)(
  { root: Style.compose(Style.global(OUTSIDE_GLOBAL), Style.self({ color: 'rgb(9, 8, 7)' })) },
  { name: 'Outside', layer: Layers.standard.layer('app') },
)
