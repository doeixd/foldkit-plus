import { Capability, Slot, Slots } from 'foldkit-mixins'

/**
 * Around and inside upstream's list: `root` is the box the list scrolls
 * within, which gives it its height, and `row` is each row's content; the
 * overlay `bar` and its `thumb` sit beside upstream's list, in `root`.
 */
export const VirtualListSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  bar: Slot.make({ capability: Capability.Container }),
  thumb: Slot.make({ capability: Capability.Container }),
})
