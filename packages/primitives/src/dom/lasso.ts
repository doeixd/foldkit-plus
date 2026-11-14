import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { isDrawn, marked } from './marked.js'
import { DRAG_THRESHOLD, HOLD_SLOP, HOLD_TO_DRAG_MS } from './pointer-drag.js'

/**
 * A rectangle in a surface's own coordinates: from the corner of its padding
 * box, scrolled with its content, which is where an absolutely placed child
 * of a positioned surface is drawn.
 */
export const LassoRect = Schema.Struct({
  left: Schema.Number,
  top: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})
export type LassoRect = typeof LassoRect.Type

export const LassoStarted = Schema.TaggedStruct('LassoStarted', {
  /** Where the press was, in the surface's coordinates. */
  x: Schema.Number,
  y: Schema.Number,
})
export type LassoStarted = typeof LassoStarted.Type

export const LassoMoved = Schema.TaggedStruct('LassoMoved', {
  rect: LassoRect,
  /** The marked items the rectangle touches now, in document order. */
  ids: Schema.Array(Schema.String),
  shiftKey: Schema.Boolean,
})
export type LassoMoved = typeof LassoMoved.Type

export const LassoEnded = Schema.TaggedStruct('LassoEnded', {
  /** The marked items the rectangle touched where the pointer was let go. */
  ids: Schema.Array(Schema.String),
  /** Shift was held at the release: add to the selection rather than replace it. */
  shiftKey: Schema.Boolean,
})
export type LassoEnded = typeof LassoEnded.Type

export const LassoCancelled = Schema.TaggedStruct('LassoCancelled', {})
export type LassoCancelled = typeof LassoCancelled.Type

export type LassoFact = LassoStarted | LassoMoved | LassoEnded | LassoCancelled

/** What a press on which starts no lasso: something of its own to press. */
const CONTROLS =
  'a[href], button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"]'

/** Whether two rectangles overlap; sharing only an edge is not touching. */
export const touches = (a: LassoRect, b: LassoRect): boolean =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height

type Pointed = Event & {
  readonly clientX: number
  readonly clientY: number
  readonly button?: number
  readonly buttons?: number
  readonly pointerId?: number
  readonly pointerType?: string
  readonly shiftKey?: boolean
  readonly key?: string
}

/**
 * Drawing a rectangle on a surface to pick the items it touches, as a Mount.
 * An item is a descendant marked by an attribute whose value is its id, as
 * `PointerDrag` and `Targets` mark them. A lasso begins on a primary press on
 * the surface itself, not on an item, a control or the surface's scrollbar,
 * once the pointer moves `DRAG_THRESHOLD`; a finger's begins once held still
 * for `HOLD_TO_DRAG_MS`, and one that moves first is a scroll, as with
 * `PointerDrag`.
 *
 * It reports where the rectangle is and which items it touches at every move,
 * measured then and never kept, and again when the surface scrolls under a
 * still pointer: the press stays where it was on the content. Releasing ends
 * the lasso with the items under it then; Escape, a cancelled pointer or a
 * release nothing reported cancels it. The click that ends a lasso does not
 * reach the surface.
 *
 * Nothing is selected here: what the ids mean is the parent's `update`. Only
 * the press listener lives as long as the surface; the rest are added for one
 * press and removed with it.
 */
export const Lasso = Mount.defineStream('Lasso', {
  messages: [LassoStarted, LassoMoved, LassoEnded, LassoCancelled],
  args: {
    /** The attribute that marks an item, holding its id. */
    attribute: Schema.String,
  },
  execute: ({ element, attribute }) =>
    Stream.callback<LassoFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const owner = element.ownerDocument
          const offer = (fact: LassoFact) => Queue.offerUnsafe(queue, fact)
          /** A client point in the surface's coordinates. */
          const local = (clientX: number, clientY: number) => {
            const box = element.getBoundingClientRect()
            return {
              x: clientX - box.left - element.clientLeft + element.scrollLeft,
              y: clientY - box.top - element.clientTop + element.scrollTop,
            }
          }
          const localRect = (rect: DOMRect): LassoRect => {
            const corner = local(rect.left, rect.top)
            return { left: corner.x, top: corner.y, width: rect.width, height: rect.height }
          }

          let pressed: {
            readonly pointer: number | undefined
            readonly touch: boolean
            /** The press, on the content. */
            readonly origin: { readonly x: number; readonly y: number }
            readonly clientX: number
            readonly clientY: number
          } | null = null
          let drawing = false
          let holding: ReturnType<typeof setTimeout> | undefined
          let last: { clientX: number; clientY: number; shiftKey: boolean } = {
            clientX: 0,
            clientY: 0,
            shiftKey: false,
          }

          const measure = (): { readonly rect: LassoRect; readonly ids: ReadonlyArray<string> } => {
            const origin = pressed?.origin ?? { x: 0, y: 0 }
            const at = local(last.clientX, last.clientY)
            const rect = {
              left: Math.min(origin.x, at.x),
              top: Math.min(origin.y, at.y),
              width: Math.abs(at.x - origin.x),
              height: Math.abs(at.y - origin.y),
            }
            const ids = marked(element, attribute)
              .filter(
                item => isDrawn(item) && touches(rect, localRect(item.getBoundingClientRect())),
              )
              .map(item => item.getAttribute(attribute) ?? '')
            return { rect, ids }
          }
          const report = () => offer(LassoMoved.make({ ...measure(), shiftKey: last.shiftKey }))

          const begin = () => {
            if (pressed === null) return
            drawing = true
            owner.getSelection()?.removeAllRanges()
            try {
              if (pressed.pointer !== undefined) element.setPointerCapture(pressed.pointer)
            } catch {
              // A pointer already gone: the release still ends the lasso.
            }
            offer(LassoStarted.make(pressed.origin))
            report()
          }
          // The click a lasso's release makes is no press on the surface.
          const swallowClick = (event: Event) => {
            event.preventDefault()
            event.stopImmediatePropagation()
          }
          const end = (outcome: 'ended' | 'cancelled') => {
            clearTimeout(holding)
            holding = undefined
            const wasDrawing = drawing
            const result = wasDrawing && outcome === 'ended' ? measure() : undefined
            const pointer = pressed?.pointer
            pressed = null
            drawing = false
            release()
            if (pointer !== undefined && element.hasPointerCapture?.(pointer) === true)
              element.releasePointerCapture(pointer)
            if (!wasDrawing) return
            if (result === undefined) return offer(LassoCancelled.make({}))
            element.addEventListener('click', swallowClick, { capture: true, once: true })
            offer(LassoEnded.make({ ids: result.ids, shiftKey: last.shiftKey }))
          }
          const ours = (event: Pointed) =>
            pressed !== null &&
            (pressed.pointer === undefined || event.pointerId === pressed.pointer)

          const onMove = (event: Event) => {
            const pointed = event as Pointed
            if (!ours(pointed) || pressed === null) return
            // Let go where no release reached us, such as over a frame.
            if (pointed.buttons !== undefined && (pointed.buttons & 1) === 0)
              return end('cancelled')
            last = {
              clientX: pointed.clientX,
              clientY: pointed.clientY,
              shiftKey: pointed.shiftKey === true,
            }
            if (!drawing) {
              const moved = Math.hypot(
                pointed.clientX - pressed.clientX,
                pointed.clientY - pressed.clientY,
              )
              // A finger that moves before its hold is up is scrolling.
              if (pressed.touch) return moved < HOLD_SLOP ? undefined : end('cancelled')
              if (moved < DRAG_THRESHOLD) return
              return begin()
            }
            report()
          }
          const onUp = (event: Event) => {
            const pointed = event as Pointed
            if (!ours(pointed)) return
            last = {
              clientX: pointed.clientX,
              clientY: pointed.clientY,
              shiftKey: pointed.shiftKey === true,
            }
            end('ended')
          }
          const onCancel = (event: Event) => {
            if (ours(event as Pointed)) end('cancelled')
          }
          // Heard on the way down and kept: the Escape that ends a lasso is the lasso's.
          const onEscape = (event: Event) => {
            if (!drawing || (event as Pointed).key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            end('cancelled')
          }
          const onScroll = () => {
            if (drawing) report()
          }
          const noSelecting = (event: Event) => event.preventDefault()
          // Once a finger's lasso is drawn, its moves are not a scroll, and a held finger opens no menu.
          const heldStill = (event: Event) => {
            if (drawing) event.preventDefault()
          }
          const noMenu = (event: Event) => {
            if (pressed?.touch === true) event.preventDefault()
          }
          const forPress: ReadonlyArray<readonly [EventTarget, string, (event: Event) => void]> = [
            [owner, 'pointermove', onMove],
            [owner, 'pointerup', onUp],
            [owner, 'pointercancel', onCancel],
            [element, 'lostpointercapture', onCancel],
            [element, 'scroll', onScroll],
            [owner, 'selectstart', noSelecting],
            [owner, 'contextmenu', noMenu],
          ]
          let listening = false
          const listen = () => {
            if (listening) return
            listening = true
            for (const [target, type, listener] of forPress) target.addEventListener(type, listener)
            owner.addEventListener('keydown', onEscape, true)
            owner.addEventListener('touchmove', heldStill, { passive: false })
          }
          const release = () => {
            if (!listening) return
            listening = false
            for (const [target, type, listener] of forPress)
              target.removeEventListener(type, listener)
            owner.removeEventListener('keydown', onEscape, true)
            owner.removeEventListener('touchmove', heldStill)
          }

          const onPress = (event: Event) => {
            const pointed = event as Pointed
            element.removeEventListener('click', swallowClick, { capture: true })
            if (pressed !== null || (pointed.button ?? 0) !== 0) return
            const target = event.target
            if (!(target instanceof Element) || !element.contains(target)) return
            const claimed = target.closest(`[${attribute}], ${CONTROLS}`)
            if (claimed !== null && element.contains(claimed)) return
            // A press on the surface's own scrollbar scrolls it.
            const at = local(pointed.clientX, pointed.clientY)
            if (
              at.x - element.scrollLeft >= element.clientWidth ||
              at.y - element.scrollTop >= element.clientHeight
            )
              return
            const touch = pointed.pointerType === 'touch'
            pressed = {
              pointer: pointed.pointerId,
              touch,
              origin: at,
              clientX: pointed.clientX,
              clientY: pointed.clientY,
            }
            last = {
              clientX: pointed.clientX,
              clientY: pointed.clientY,
              shiftKey: pointed.shiftKey === true,
            }
            listen()
            if (touch) {
              holding = setTimeout(() => {
                holding = undefined
                if (pressed !== null && !drawing) begin()
              }, HOLD_TO_DRAG_MS)
            }
          }
          element.addEventListener('pointerdown', onPress)
          return { onPress, stop: () => end('cancelled'), swallowClick }
        }),
        ({ onPress, stop, swallowClick }) =>
          Effect.sync(() => {
            element.removeEventListener('pointerdown', onPress)
            element.removeEventListener('click', swallowClick, { capture: true })
            stop()
          }),
      ),
    ),
})
