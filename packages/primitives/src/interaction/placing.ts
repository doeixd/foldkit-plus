/**
 * Keeps a floating panel inside the viewport: on insert it shifts left past
 * the right edge and flips above its trigger when the bottom overflows and
 * the room overhead fits; on release every inline prop goes. `placeFor` is
 * pure geometry over rects, so the rule is unit-tested and the Mount only
 * reads and writes. Inert without layout (zero rects never overflow), with
 * no timers, observers, or reposition loops.
 *
 * `placeAt` is the other half, for a popup that must open under the trigger
 * that opened it. It writes `left` and `--fk-placed-top` once, relative to
 * the popup's offset parent; the panel's stylesheet reads the variable as
 * `top`, so `keepWithin` can still replace `top` when it flips. Key the
 * popup by the trigger: a Mount reads its args at insert and never again.
 * `placeAtPoint` is the same write for a viewport point, when the open
 * event carried coordinates the message builder dropped. The two mounts
 * start together, so the fit may run before that write; the write measures
 * again. A point that would hang past the bottom shifts up. A trigger still
 * flips, and the panel is marked `data-fk-placed="above"` so a hover bridge
 * can follow the side that opened.
 * Zero-size rects stay at the origin, so an inert document writes nothing
 * a layout pass would have to undo.
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
import { Effect, Option, Schema, Stream } from 'effect'
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

/** Pixels to move a box up so its bottom sits `margin` inside the viewport.
 *  `0` when it already fits, or when its top is already at the margin. */
export const shiftIntoViewport = (
  rect: { readonly top: number; readonly bottom: number },
  viewportHeight: number,
  margin = 8,
): number => {
  const overflow = rect.bottom - (viewportHeight - margin)
  if (overflow <= 0) return 0
  const room = rect.top - margin
  if (room <= 0) return 0
  return Math.min(overflow, room)
}

/** Attribute `keepWithin` sets to `placedAbove` when the panel flips. */
export const placedSide = 'data-fk-placed'

/** Value of `placedSide` while the panel stands above its anchor. */
export const placedAbove = 'above'

export interface AnchorRect {
  readonly left: number
  readonly top: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

export interface OriginRect {
  readonly left: number
  readonly top: number
}

export interface PlacedAt {
  readonly left: number
  readonly top: number
}

/** Custom property `PlaceAt` writes. A panel reads it as `top` so a viewport
 *  flip, which sets the `top` property, still wins. */
export const placedTop = '--fk-placed-top'

/** Where a popup sits under its trigger's left edge, in the offset parent's
 *  coordinates. A zero-size trigger (an inert document) stays at the origin. */
export const placeAt = (trigger: AnchorRect, origin: OriginRect, gap = 4): PlacedAt => {
  if (trigger.width === 0 && trigger.height === 0) return { left: 0, top: 0 }
  return {
    left: trigger.left - origin.left,
    top: trigger.bottom - origin.top + gap,
  }
}

export interface ViewportPoint {
  readonly x: number
  readonly y: number
}

/** Where a popup's top-left sits on a viewport point, in the offset parent's
 *  coordinates. A context menu uses it: the right-click event carries the
 *  point, and `OnContextMenu` does not. */
export const placeAtPoint = (point: ViewportPoint, origin: OriginRect): PlacedAt => ({
  left: point.x - origin.left,
  top: point.y - origin.top,
})

const clearFit = (element: HTMLElement): void => {
  element.style.translate = ''
  element.style.top = ''
  element.style.bottom = ''
  element.removeAttribute(placedSide)
}

const fitWithin = (element: HTMLElement): void => {
  // A previous fit may have flipped. Clear it before reading, or the next
  // decision would describe the flipped box.
  clearFit(element)
  const rect = element.getBoundingClientRect()
  const placed = placeFor(
    { top: rect.top, right: rect.right, bottom: rect.bottom, height: rect.height },
    { width: document.documentElement.clientWidth, height: window.innerHeight },
  )
  if (placed.dx !== 0) element.style.translate = `${placed.dx}px 0`
  if (placed.flip) {
    element.style.top = 'auto'
    element.style.bottom = 'calc(100% + 4px)'
    element.setAttribute(placedSide, placedAbove)
  }
}

// PlaceAt and KeepWithin start together (`Stream.mergeAll`), so the fit can
// run before the placement write. The write calls whoever is waiting.
const refits = new WeakMap<HTMLElement, Set<() => void>>()

const onPlaced = (element: HTMLElement, refit: () => void): void => {
  const waiting = refits.get(element) ?? new Set()
  waiting.add(refit)
  refits.set(element, waiting)
}

const offPlaced = (element: HTMLElement, refit: () => void): void => {
  const waiting = refits.get(element)
  if (waiting === undefined) return
  waiting.delete(refit)
  if (waiting.size === 0) refits.delete(element)
}

const notifyPlaced = (element: HTMLElement): void => {
  const waiting = refits.get(element)
  if (waiting === undefined) return
  for (const refit of waiting) refit()
}

const applyPlaced = (element: HTMLElement, placed: PlacedAt): void => {
  element.style.left = `${placed.left}px`
  element.style.setProperty(placedTop, `${placed.top}px`)
}

const clearPlaced = (element: HTMLElement): void => {
  element.style.left = ''
  element.style.removeProperty(placedTop)
}

const writePlaced = (element: HTMLElement, placed: PlacedAt, shift: boolean): void => {
  clearFit(element)
  applyPlaced(element, placed)
  if (shift) {
    const rect = element.getBoundingClientRect()
    const dy = shiftIntoViewport({ top: rect.top, bottom: rect.bottom }, window.innerHeight)
    if (dy !== 0) element.style.setProperty(placedTop, `${placed.top - dy}px`)
  }
  notifyPlaced(element)
}

export const KeepWithin = Mount.defineStream('KeepWithin', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() => {
      if (!(element instanceof HTMLElement)) {
        return Effect.acquireRelease(Effect.void, () => Effect.void)
      }
      const node = element
      const refit = (): void => fitWithin(node)
      return Effect.acquireRelease(
        Effect.sync(() => {
          onPlaced(node, refit)
          refit()
        }),
        () =>
          Effect.sync(() => {
            offPlaced(node, refit)
            clearFit(node)
          }),
      )
    }),
})

const paddingEdge = (node: HTMLElement): OriginRect => {
  const rect = node.getBoundingClientRect()
  // Absolute `left`/`top` start at the padding edge; the rect is the border box.
  return { left: rect.left + node.clientLeft, top: rect.top + node.clientTop }
}

const originOf = (element: HTMLElement): OriginRect => {
  const originNode = element.offsetParent
  return originNode instanceof HTMLElement ? paddingEdge(originNode) : { left: 0, top: 0 }
}

export const PlaceAt = Mount.defineStream('PlaceAt', {
  messages: [Schema.Never],
  args: {
    /** Element id of the trigger the popup opens under. */
    triggerId: Schema.String,
    /** Pixels between the trigger's bottom and the popup. */
    gap: Schema.Number,
  },
  execute: ({ element, triggerId, gap }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (!(element instanceof HTMLElement)) return
          const trigger = document.getElementById(triggerId)
          if (!(trigger instanceof HTMLElement)) return
          const rect = trigger.getBoundingClientRect()
          writePlaced(
            element,
            placeAt(
              {
                left: rect.left,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              },
              originOf(element),
              gap,
            ),
            false,
          )
        }),
        () =>
          Effect.sync(() => {
            if (!(element instanceof HTMLElement)) return
            clearPlaced(element)
          }),
      ),
    ),
})

export const PlaceAtPoint = Mount.defineStream('PlaceAtPoint', {
  messages: [Schema.Never],
  args: {
    /** Viewport x of the popup's top-left. */
    x: Schema.Number,
    /** Viewport y of the popup's top-left. */
    y: Schema.Number,
  },
  execute: ({ element, x, y }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (!(element instanceof HTMLElement)) return
          // The offset parent is not the point. Shifting keeps the menu beside
          // it; flipping would send the menu above that parent.
          writePlaced(element, placeAtPoint({ x, y }, originOf(element)), true)
        }),
        () =>
          Effect.sync(() => {
            if (!(element instanceof HTMLElement)) return
            clearPlaced(element)
          }),
      ),
    ),
})

export const placeAtTrigger =
  <Slots>(slots: Slots) =>
  <Input, ParentMessage>(options: {
    readonly panel: keyof Slots & string
    /** The trigger this open belongs to. Read at insert, so key the panel by it. */
    readonly triggerId: (input: Input) => string
    readonly gap?: number
    /** A viewport point wins over the trigger. None places under `triggerId`. */
    readonly at?: (input: Input) => Option.Option<ViewportPoint>
  }): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.panel]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: input => {
            const at = options.at?.(input) ?? Option.none()
            return Option.isSome(at)
              ? PlaceAtPoint({ x: at.value.x, y: at.value.y })
              : PlaceAt({ triggerId: options.triggerId(input), gap: options.gap ?? 4 })
          },
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'PlaceAt' },
    )

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
