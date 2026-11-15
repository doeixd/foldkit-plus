/**
 * An overlay's way back to what opened it, shared by `FocusScope`,
 * `FocusReturn` and `FocusRecovery`. It keeps no record of focus: `FocusReturn`
 * alone follows the trail of elements focused, so a page with only a scope or
 * an owner installs no listener.
 */
import { canTakeFocus, tabbableWithin, take } from './focusable.js'

/** An HTML element of its own document's realm: a frame's elements are no `HTMLElement` of the page's. */
export const isHtml = (node: unknown): node is HTMLElement => {
  if (typeof node !== 'object' || node === null || !('ownerDocument' in node)) return false
  const realm = (node as Node).ownerDocument?.defaultView?.HTMLElement
  return realm !== undefined && node instanceof realm
}

/** The focused element, when it is outside the overlay and not `body`. */
export const activeOutside = (overlay: Element): HTMLElement | undefined => {
  const active = overlay.ownerDocument.activeElement
  return isHtml(active) && active !== overlay.ownerDocument.body && !overlay.contains(active)
    ? active
    : undefined
}

type OpenerRecovery = (opener: HTMLElement) => (() => boolean) | undefined
let openerRecovery: OpenerRecovery = () => undefined

/**
 * Where `FocusRecovery` lends its owners' fallback steps, once that module is
 * loaded. A way taken before then has none: a `FocusRecovery` loaded lazily
 * after an overlay opened gives that overlay no recovery.
 */
export const setOpenerRecovery = (recovery: OpenerRecovery): void => {
  openerRecovery = recovery
}

/** An overlay's way back, decided when it opens: what to return to, and what its neighbours were. */
export interface Return {
  readonly opener: HTMLElement | undefined
  readonly recovery: (() => boolean) | undefined
}

/** The way back from an overlay that `opener` opened. */
export const returnOf = (opener: HTMLElement | undefined): Return => ({
  opener,
  recovery: opener === undefined ? undefined : openerRecovery(opener),
})

/** Focus is on nothing, or still inside the overlay that is going. */
export const lostIn = (overlay: Element): boolean => {
  const active = overlay.ownerDocument.activeElement
  return active === null || active === overlay.ownerDocument.body || overlay.contains(active)
}

/** Focuses the opener when it can take focus, without scrolling the page to it, as focus always came back. */
export const backToOpener = ({ opener }: Return): boolean => {
  if (opener === undefined || !canTakeFocus(opener)) return false
  opener.focus({ preventScroll: true })
  return opener.ownerDocument.activeElement === opener
}

/**
 * Gives focus a place when the overlay goes and its opener cannot take it
 * back, by the first rule that finds an element that can take it:
 *
 * 1. an element with the opener's id, for an opener drawn again;
 * 2. the opener's `FocusRecovery` fallback steps for its slot, when it was a
 *    part of an owner (`same`, `next`, `previous`, `parent`, `stop`, `{ part }`, `owner`);
 * 3. the layer below this one, its first tabbable element or itself;
 * 4. the page's first tabbable element.
 *
 * `below` is read by the caller before the overlay leaves the stack.
 */
export const fallBack = (
  overlay: Element,
  { opener, recovery }: Return,
  below: Element | undefined,
): void => {
  const doc = overlay.ownerDocument
  const redrawn = opener === undefined || opener.id === '' ? null : doc.getElementById(opener.id)
  if (isHtml(redrawn) && take(redrawn)) return
  if (recovery?.() === true) return
  if (below !== undefined) {
    if (take(tabbableWithin(below)[0])) return
    if (isHtml(below) && take(below)) return
  }
  take(tabbableWithin(doc.body).find(each => !overlay.contains(each)))
}
