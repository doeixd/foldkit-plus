/**
 * Two Mounts over Foldkit's own DOM helpers, for an overlay that is not a
 * native `<dialog>` or `popover`:
 *
 * - `ScrollLock` locks the document's scroll while mounted. Foldkit's lock is
 *   refcounted, so nested overlays release it only when the last one goes.
 * - `HideOutside` marks everything outside the element inert while mounted,
 *   through `Dom.inertOthers`, keyed by an id this Mount mints. The element
 *   is a layer of the document's stack, and a layer opened after it is never
 *   marked, wherever it is drawn: the topmost layer decides what is hidden.
 *
 * Both emit no Messages; they are element lifecycle.
 */
import { Effect, Schema, Stream } from 'effect'
import * as Dom from 'foldkit/dom'
import * as Mount from 'foldkit/mount'
import * as LayerStack from './layer-stack.js'

/** Locks the document's scroll while the element is mounted; nested locks release with the last. */
export const ScrollLock = Mount.defineStream('ScrollLock', {
  messages: [Schema.Never],
  execute: () =>
    Stream.callback<never>(() => Effect.acquireRelease(Dom.lockScroll, () => Dom.unlockScroll)),
})

const HIDE_OUTSIDE_ATTRIBUTE = 'data-foldkit-plus-hide-outside'

let minted = 0

/**
 * Makes everything outside the element, and outside each layer opened after
 * it, inert while it is mounted, and restores it after.
 */
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
          const isolate = () =>
            Dom.inertOthers(id, [
              `[${HIDE_OUTSIDE_ATTRIBUTE}="${id}"]`,
              ...LayerStack.selectorsAbove(element),
            ])
          // Reusing the id swaps the inert set in place, so what stays outside stays inert.
          const release = LayerStack.open(element, () =>
            Effect.runFork(Effect.andThen(isolate(), Effect.sync(LayerStack.showed))),
          )
          yield* isolate()
          return { id, release }
        }),
        ({ id, release }) =>
          Effect.andThen(Dom.restoreInert(id), () =>
            Effect.sync(() => {
              element.removeAttribute(HIDE_OUTSIDE_ATTRIBUTE)
              release()
            }),
          ),
      ),
    ),
})
