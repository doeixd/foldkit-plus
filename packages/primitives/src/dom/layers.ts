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
import { Effect, Schema, Stream } from 'effect'
import * as Dom from 'foldkit/dom'
import * as Mount from 'foldkit/mount'

export const ScrollLock = Mount.defineStream('ScrollLock', {
  messages: [Schema.Never],
  execute: () =>
    Stream.callback<never>(() => Effect.acquireRelease(Dom.lockScroll, () => Dom.unlockScroll)),
})

const HIDE_OUTSIDE_ATTRIBUTE = 'data-foldkit-plus-hide-outside'

let minted = 0

export const HideOutside = Mount.defineStream('HideOutside', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.gen(function* () {
          // A per-mount id: Foldkit keys the inert set by it, so two overlays
          // restore independently. The attribute is how the element is found.
          const id = `hide-outside-${(minted += 1)}`
          element.setAttribute(HIDE_OUTSIDE_ATTRIBUTE, id)
          yield* Dom.inertOthers(id, [`[${HIDE_OUTSIDE_ATTRIBUTE}="${id}"]`])
          return id
        }),
        id =>
          Effect.andThen(Dom.restoreInert(id), () =>
            Effect.sync(() => element.removeAttribute(HIDE_OUTSIDE_ATTRIBUTE)),
          ),
      ),
    ),
})
