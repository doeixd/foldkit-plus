/**
 * Finds a node removed while it held focus, which the browser reports to no one:
 * a focused element that a render replaces simply stops being focused, and the
 * page reads that as the user leaving. Opt in from a browser test around the
 * interaction that must keep its focus (`watchFocusLoss()`, act, read `losses`,
 * `dispose()`); it is not global, since a dialog closing legitimately removes a
 * focused node before focus is returned.
 *
 * It watches the DOM calls Foldkit's differ patches with (`removeChild`,
 * `replaceChild`) and `Element.remove`, not mutation records: the record is
 * delivered after the code that moved focus onwards has run.
 */
export interface FocusLoss {
  /** The element that held focus. */
  readonly focused: Element
  /** The node being removed: the focused element or one of its ancestors. */
  readonly removed: Node
  readonly from: Node
}

export interface FocusLossWatch {
  readonly losses: ReadonlyArray<FocusLoss>
  /** Puts the DOM methods back; calling it twice does nothing. */
  readonly dispose: () => void
}

export function watchFocusLoss(): FocusLossWatch
