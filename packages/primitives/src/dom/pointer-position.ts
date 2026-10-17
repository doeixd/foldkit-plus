import { Effect, Option, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/**
 * A place in an element's padding box, in CSS pixels from its top left
 * corner, and the pointer's pressure there (0 to 1; a mouse reads 0.5 while
 * a button is down). A captured pointer can be outside the box, so `x` and
 * `y` can be negative or past its size.
 */
export const PointerPoint = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  pressure: Schema.Number,
})
export type PointerPoint = typeof PointerPoint.Type

/** The padding box's size at the event, in CSS pixels. */
const Size = { width: Schema.Number, height: Schema.Number }

export const PointerPressed = Schema.TaggedStruct('PointerPressed', {
  ...Size,
  point: PointerPoint,
  /** `mouse`, `pen` or `touch`, as the browser names it. */
  pointerType: Schema.String,
})
export type PointerPressed = typeof PointerPressed.Type

export const PointerMoved = Schema.TaggedStruct('PointerMoved', {
  ...Size,
  /** Where the pointer is now. */
  point: PointerPoint,
  /**
   * Every place it passed since the last move, ending with `point`: the
   * browser's coalesced events, so a fast stroke keeps its curve. Just
   * `point` where the browser coalesces none.
   */
  points: Schema.Array(PointerPoint),
})
export type PointerMoved = typeof PointerMoved.Type

export const PointerReleased = Schema.TaggedStruct('PointerReleased', {
  /** `false` when the pointer was cancelled, lost its capture, or pressed again unreleased. */
  completed: Schema.Boolean,
})
export type PointerReleased = typeof PointerReleased.Type

export type PointerFact = PointerPressed | PointerMoved | PointerReleased

interface Sides {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export interface Rect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/**
 * The padding box of an element whose border box is `rect`: inside its
 * border, padding included. An absolutely positioned child (a thumb, a
 * stroke) is laid out against it, so a place read here is where that child
 * sits, whatever padding a stylist adds.
 */
export const paddingBoxOf = (layout: { readonly rect: Rect; readonly border: Sides }): Rect => {
  const { rect, border } = layout
  return {
    left: rect.left + border.left,
    top: rect.top + border.top,
    width: Math.max(0, rect.width - border.left - border.right),
    height: Math.max(0, rect.height - border.top - border.bottom),
  }
}

const borderOf = (style: CSSStyleDeclaration): Sides => ({
  top: parseFloat(style.borderTopWidth),
  right: parseFloat(style.borderRightWidth),
  bottom: parseFloat(style.borderBottomWidth),
  left: parseFloat(style.borderLeftWidth),
})

/**
 * An element's padding box now, in the viewport, as `PointerPosition`
 * measures it: for a size kept beside its places, which a `ResizeObserver`'s
 * content box does not match once the element has padding. Read from the
 * bounding rectangle and the computed border, since `clientWidth` and
 * `clientLeft` round to whole pixels.
 */
export const measurePaddingBox = (element: Element): Rect =>
  paddingBoxOf({
    rect: element.getBoundingClientRect(),
    border: borderOf(getComputedStyle(element)),
  })

const pointIn = (box: Rect, event: PointerEvent): PointerPoint => ({
  x: event.clientX - box.left,
  y: event.clientY - box.top,
  pressure: event.pressure,
})

/**
 * Where one pointer is inside an element, as a Mount, for a surface the
 * pointer draws on or points into (a color area, a dial, a signature pad): a
 * primary press, each move until the release, and the release, each with
 * the place in the element's padding box and the box's size. The box is
 * measured at each event, so an element that moved or resized is followed.
 * Coordinates are raw, left to right and top down whatever the direction:
 * what a place means (a share, an angle, a reading direction) is the parent's.
 *
 * The pointer is captured from press to release, so a drag that leaves the
 * element is still heard, and the moves and the release are listened to only
 * meanwhile. A press keeps the browser's own focus and text selection away,
 * and a second pointer while one is down is ignored.
 */
export const PointerPosition = Mount.defineStream('PointerPosition', {
  messages: [PointerPressed, PointerMoved, PointerReleased],
  args: {
    /**
     * A descendant to focus on a press, found by this selector (a thumb), so
     * the keys go on from where the pointer left it.
     */
    focus: Schema.optionalKey(Schema.String),
  },
  execute: ({ element, focus }) =>
    Stream.callback<PointerFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const offer = (fact: PointerFact) => Queue.offerUnsafe(queue, fact)
          let held: Option.Option<number> = Option.none()
          const ours = (event: Event): event is PointerEvent =>
            event instanceof PointerEvent && Option.contains(held, event.pointerId)

          const release = () => {
            if (Option.isNone(held)) return
            const pointerId = held.value
            held = Option.none()
            for (const [type, listener] of during) element.removeEventListener(type, listener)
            try {
              element.releasePointerCapture(pointerId)
            } catch {
              // Capture may already be gone with the pointer.
            }
          }
          const end = (completed: boolean) => (event: Event) => {
            if (!ours(event)) return
            release()
            offer(PointerReleased.make({ completed }))
          }
          const move = (event: Event) => {
            if (!ours(event)) return
            const box = measurePaddingBox(element)
            const point = pointIn(box, event)
            // Safari coalesces none and has no method for it.
            const coalesced = event.getCoalescedEvents?.() ?? []
            offer(
              PointerMoved.make({
                width: box.width,
                height: box.height,
                point,
                points: coalesced.length > 0 ? coalesced.map(one => pointIn(box, one)) : [point],
              }),
            )
          }
          const during: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            ['pointermove', move],
            ['pointerup', end(true)],
            ['pointercancel', end(false)],
            ['lostpointercapture', end(false)],
          ]

          const down = (event: Event) => {
            if (!(event instanceof PointerEvent) || event.button !== 0) return
            if (Option.isSome(held)) {
              if (!ours(event)) return
              // The same pointer down again: its release went where nothing heard it.
              release()
              offer(PointerReleased.make({ completed: false }))
            }
            held = Option.some(event.pointerId)
            for (const [type, listener] of during) element.addEventListener(type, listener)
            try {
              element.setPointerCapture(event.pointerId)
            } catch {
              // A pointer the browser no longer tracks cannot be captured; its moves over the element still come.
            }
            // Kept from the browser's own focus and text selection, and from the mouse events a touch also sends.
            event.preventDefault()
            if (focus !== undefined) {
              const into = element.querySelector(focus)
              if (into instanceof HTMLElement) into.focus()
            }
            const box = measurePaddingBox(element)
            offer(
              PointerPressed.make({
                width: box.width,
                height: box.height,
                point: pointIn(box, event),
                pointerType: event.pointerType,
              }),
            )
          }
          element.addEventListener('pointerdown', down)
          return () => {
            element.removeEventListener('pointerdown', down)
            release()
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})
