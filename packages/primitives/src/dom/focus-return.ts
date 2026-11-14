import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { holdOpener, recoverOpener, take, type Opener } from './focus-recovery.js'
import { canTakeFocus, tabbableWithin } from './focusable.js'
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

/** What had focus before the overlay took it: the focused element outside it, else the latest one that was. */
export const openerOf = (overlay: Element): HTMLElement | undefined => {
  const active = overlay.ownerDocument.activeElement
  if (active instanceof HTMLElement && active !== overlay.ownerDocument.body) {
    if (!overlay.contains(active)) return active
  }
  return [...trail].reverse().find(each => each.isConnected && !overlay.contains(each))
}

/** An overlay's way back, decided when it opens: what to return to, and what its neighbours were. */
export interface Return {
  readonly opener: HTMLElement | undefined
  readonly recovery: Opener | undefined
}

export const returnOf = (overlay: Element): Return => {
  const opener = openerOf(overlay)
  return { opener, recovery: opener === undefined ? undefined : holdOpener(opener) }
}

/**
 * Gives focus back as the overlay goes, by the first rule that finds an
 * element that can take it:
 *
 * 1. the opener itself;
 * 2. an element with the opener's id, for an opener drawn again;
 * 3. the opener's `FocusRecovery` fallback steps for its slot, when it was a
 *    part of an owner (`same`, `next`, `previous`, `parent`, `stop`, `{ part }`, `owner`);
 * 4. the layer below this one, its first tabbable element or itself;
 * 5. the page's first tabbable element.
 *
 * It never leaves focus on `body` while any of those exists. `below` is read
 * by the caller before the overlay leaves the stack.
 */
export const giveBack = (
  overlay: Element,
  { opener, recovery }: Return,
  below: Element | undefined,
): void => {
  const doc = overlay.ownerDocument
  if (opener !== undefined && canTakeFocus(opener)) {
    // As focus always came back: without scrolling the page to it.
    opener.focus()
    if (doc.activeElement === opener) return
  }
  const redrawn = opener === undefined || opener.id === '' ? null : doc.getElementById(opener.id)
  if (redrawn instanceof HTMLElement && take(redrawn)) return
  if (recovery !== undefined && recoverOpener(recovery)) return
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
 * focus lost (on `body`, or inside it), focus goes by the rules of
 * `giveBack`. Focus the user moved elsewhere is left alone, and nothing is
 * focused on mount: `FocusScope` does that. It sends no Message.
 */
export const FocusReturn = Mount.defineStream('FocusReturn', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => ({ way: returnOf(element), release: LayerStack.open(element) })),
        ({ way, release }) =>
          Effect.sync(() => {
            const below = LayerStack.below(element)
            release()
            const active = element.ownerDocument.activeElement
            const lost =
              active === null || active === element.ownerDocument.body || element.contains(active)
            if (lost) giveBack(element, way, below)
          }),
      ),
    ),
})
