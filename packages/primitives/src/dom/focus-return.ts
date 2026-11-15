import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { canTakeFocus, tabbableWithin, take } from './focusable.js'
import * as LayerStack from './layer-stack.js'

const TRAIL = 8
const trail: Array<HTMLElement> = []

// Focus has usually moved into an overlay before its Mount runs (a Command
// shows it as soon as the Message lands), so what had it first is read from
// here rather than from `activeElement`.
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    event => {
      const target = event.target
      if (!(target instanceof HTMLElement) || target === document.body) return
      if (trail.at(-1) === target) return
      trail.push(target)
      if (trail.length > TRAIL) trail.shift()
    },
    true,
  )
}

/** The focused element, when it is outside the overlay and not `body`. */
export const activeOutside = (overlay: Element): HTMLElement | undefined => {
  const active = overlay.ownerDocument.activeElement
  return active instanceof HTMLElement &&
    active !== overlay.ownerDocument.body &&
    !overlay.contains(active)
    ? active
    : undefined
}

/** What had focus before the overlay took it: the focused element outside it, else the latest one that was. */
export const openerOf = (overlay: Element): HTMLElement | undefined =>
  activeOutside(overlay) ??
  [...trail].reverse().find(each => each.isConnected && !overlay.contains(each))

type OpenerRecovery = (opener: HTMLElement) => (() => boolean) | undefined
let openerRecovery: OpenerRecovery = () => undefined

/** Where `FocusRecovery` lends its owners' fallback steps, once that module is loaded. */
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
  if (redrawn instanceof HTMLElement && take(redrawn)) return
  if (recovery?.() === true) return
  if (below !== undefined) {
    if (take(tabbableWithin(below)[0])) return
    if (below instanceof HTMLElement && take(below)) return
  }
  take(tabbableWithin(doc.body).find(each => !overlay.contains(each)))
}

/**
 * Gives focus a way back for an overlay whose own restoring is not ours (a
 * Dialog's: it returns to its opener, and to `body` when that is gone). It
 * takes the opener when the overlay mounts; when the overlay unmounts with
 * focus lost (on `body`, or inside it), focus goes back to the opener, else
 * by the rules of `fallBack`. Focus the user moved elsewhere is left alone, and nothing is
 * focused on mount: `FocusScope` does that. It sends no Message.
 */
export const FocusReturn = Mount.defineStream('FocusReturn', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => ({
          way: returnOf(openerOf(element)),
          release: LayerStack.open(element),
        })),
        ({ way, release }) =>
          Effect.sync(() => {
            const below = LayerStack.below(element)
            release()
            if (lostIn(element) && !backToOpener(way)) fallBack(element, way, below)
          }),
      ),
    ),
})
