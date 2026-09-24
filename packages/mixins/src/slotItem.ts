/**
 * Which repetition of a slot is being resolved, when a view renders one slot
 * once per item (rows, tabs, options). The view passes it as the second
 * argument of `slots.x.attrs(base, item)`; a Behavior reads it to write
 * per-item attributes such as `tabindex`, `aria-posinset`, or an id, and a
 * `Style.perItem` piece reads it for appearance.
 */
export interface SlotItem {
  readonly index: number
  /** The item's stable identity, when it has one: a row id, an option value. */
  readonly id?: string
  /** How many items the slot renders, when the view knows. */
  readonly count?: number
}
