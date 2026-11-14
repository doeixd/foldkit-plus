import { isBound, type Bound } from '../slotView.js'

/** Slots that are not a `SlotView.over` binder, so a binder that fails a factory's first overload is refused there, not read as slots. */
export type Unbound<Slots> = Slots extends Bound<any, any, any> ? never : Slots

/** The slots a Behavior factory was given: the binder's, or the slots themselves. */
export const boundSlots = <Slots>(given: Slots | Bound<Slots, any, any>): Slots =>
  isBound(given) ? given.slots : given
