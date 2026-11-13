/**
 * Two Mounts over Foldkit's own DOM helpers, for an overlay that is not a
 * native `<dialog>` or `popover`:
 *
 * - `ScrollLock` locks the document's scroll while mounted. Foldkit's lock is
 *   refcounted, so nested overlays release it only when the last one goes.
 * - `HideOutside` marks everything outside the element inert while mounted,
 *   through `Dom.inertOthers`, keyed by an id this Mount mints.
 *
 * Both emit no Messages; they are element lifecycle.
 */
import { Cause, Effect, Queue, Schema, Stream } from 'effect'
import * as Dom from 'foldkit/dom'
import * as Mount from 'foldkit/mount'
import { LEAVING } from './leaving.js'

/** Locks the document's scroll while the element is mounted; nested locks release with the last. */
export const ScrollLock = Mount.defineStream('ScrollLock', {
  messages: [Schema.Never],
  execute: () =>
    Stream.callback<never>(() => Effect.acquireRelease(Dom.lockScroll, () => Dom.unlockScroll)),
})

const HIDE_OUTSIDE_ATTRIBUTE = 'data-foldkit-plus-hide-outside'

let minted = 0

/**
 * Makes everything outside the element inert while it is mounted, and restores
 * it after. While the element is leaving, the rest of the page is reachable
 * again: focus is on its way out, and the fallback may be out there. Shown
 * again, the element hides the outside once more.
 */
export const HideOutside = Mount.defineStream('HideOutside', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        // A per-mount id: Foldkit keys the inert set by it, so two overlays
        // restore independently. The attribute is how the element is found.
        const id = `hide-outside-${(minted += 1)}`
        element.setAttribute(HIDE_OUTSIDE_ATTRIBUTE, id)
        const conceal = () => Dom.inertOthers(id, [`[${HIDE_OUTSIDE_ATTRIBUTE}="${id}"]`])
        const answers = yield* Queue.unbounded<boolean, Cause.Done>()
        const changes = new MutationObserver(() => {
          // Synchronous, in this observer turn: `Leaving` focuses on a later
          // microtask, and that fallback may be an element this set made inert.
          // `restoreInert` also drops a request `inertOthers` has not committed.
          if (element.hasAttribute(LEAVING)) Effect.runSync(Dom.restoreInert(id))
          else Queue.offerUnsafe(answers, false)
        })
        yield* Effect.addFinalizer(() =>
          Effect.andThen(
            Effect.sync(() => {
              changes.disconnect()
              Queue.endUnsafe(answers)
            }),
            Effect.andThen(
              Dom.restoreInert(id),
              Effect.sync(() => element.removeAttribute(HIDE_OUTSIDE_ATTRIBUTE)),
            ),
          ),
        )
        changes.observe(element, { attributes: true, attributeFilter: [LEAVING] })
        if (!element.hasAttribute(LEAVING)) yield* conceal()
        return Stream.fromQueue(answers).pipe(
          Stream.mapEffect(() => (element.hasAttribute(LEAVING) ? Effect.void : conceal())),
          Stream.drain,
        )
      }),
    ),
})
