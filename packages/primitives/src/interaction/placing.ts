/**
 * Keeps a floating panel inside the viewport: on insert it shifts left past
 * the right edge and flips above its trigger when the bottom overflows and
 * the room overhead fits; on release every inline prop goes. `placeFor` is
 * pure geometry over rects, so the rule is unit-tested and the Mount only
 * reads and writes. Inert without layout (zero rects never overflow), with
 * no timers, observers, or reposition loops.
 *
 * Three related pieces this is not:
 *
 * - `Anchor.behavior` (`foldkit-mixins-ui`) binds a floating element to
 *   another element's id through floating-ui, with portals and continuous
 *   repositioning. It relocates nodes out from under the runtime (portal by
 *   default) and burns under zero geometry; reach for it when the panel must
 *   track a moving anchor, not for a popup placed once.
 * - `KeepInView` (`foldkit-primitives/dom`) scrolls newly marked content
 *   into view. Same verb, opposite direction: that one moves the page to
 *   the panel, this one moves the panel into the page.
 * - `Overlay.behaviors` owns dismissal, focus, scroll lock, and inertness,
 *   but no positioning; spread this alongside it for the full overlay.
 */
import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { Behavior, Capability } from 'foldkit-mixins'

export interface PanelRect {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly height: number
}

export interface Viewport {
  readonly width: number
  readonly height: number
}

export interface Placed {
  /** Pixels to move left; `0` when the panel fits. */
  readonly dx: number
  /** Whether the panel stands above its trigger instead of below. */
  readonly flip: boolean
}

/** Where the panel goes so it fits: left by the overflow, above when the
 *  bottom clears the window and the room overhead fits the panel. */
export const placeFor = (rect: PanelRect, viewport: Viewport, margin = 8): Placed => {
  const over = rect.right - viewport.width + margin
  return {
    dx: over > 0 ? -over : 0,
    flip: rect.bottom > viewport.height && rect.top - margin >= rect.height,
  }
}

export const KeepWithin = Mount.defineStream('KeepWithin', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (!(element instanceof HTMLElement)) return
          const rect = element.getBoundingClientRect()
          const placed = placeFor(
            { top: rect.top, right: rect.right, bottom: rect.bottom, height: rect.height },
            { width: document.documentElement.clientWidth, height: window.innerHeight },
          )
          if (placed.dx !== 0) element.style.translate = `${placed.dx}px 0`
          if (placed.flip) {
            element.style.top = 'auto'
            element.style.bottom = 'calc(100% + 4px)'
          }
        }),
        () =>
          Effect.sync(() => {
            if (!(element instanceof HTMLElement)) return
            element.style.translate = ''
            element.style.top = ''
            element.style.bottom = ''
          }),
      ),
    ),
})

export const keepWithin =
  <Slots>(slots: Slots) =>
  <Input, ParentMessage>(options: {
    readonly panel: keyof Slots & string
  }): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.panel]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: () => KeepWithin(),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'KeepWithin' },
    )
