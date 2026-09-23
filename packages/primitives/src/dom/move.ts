/**
 * Pointer movement on an element as a Mount: a primary-button pointer down
 * captures the pointer, each move reports the delta from where it started,
 * and up, cancel, or lost capture ends it. Nothing is decided here: a drag
 * threshold, a snap, or a constraint is the parent's `update`. Capture is
 * released with the Mount.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const MoveStarted = Schema.TaggedStruct('MoveStarted', {
  pointerId: Schema.Number,
  pointerType: Schema.String,
})
export type MoveStarted = typeof MoveStarted.Type

export const Moved = Schema.TaggedStruct('Moved', {
  pointerId: Schema.Number,
  /** From where the pointer went down, in CSS pixels. */
  deltaX: Schema.Number,
  deltaY: Schema.Number,
  pointerType: Schema.String,
})
export type Moved = typeof Moved.Type

export const MoveEnded = Schema.TaggedStruct('MoveEnded', {
  pointerId: Schema.Number,
  /** `false` when the pointer was cancelled or capture was lost. */
  completed: Schema.Boolean,
})
export type MoveEnded = typeof MoveEnded.Type

export type Fact = MoveStarted | Moved | MoveEnded

type PointerLike = Event & {
  readonly pointerId?: number
  readonly button?: number
  readonly pointerType?: string
  readonly clientX?: number
  readonly clientY?: number
}

type Capturing = Element & {
  setPointerCapture?: (pointerId: number) => void
  releasePointerCapture?: (pointerId: number) => void
}

export const Move = Mount.defineStream('Move', {
  messages: [MoveStarted, Moved, MoveEnded],
  execute: ({ element }) =>
    Stream.callback<Fact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const target = element as Capturing
          let active: {
            readonly pointerId: number
            readonly x: number
            readonly y: number
          } | null = null
          const offer = (fact: Fact) => Queue.offerUnsafe(queue, fact)
          const end = (pointerId: number, completed: boolean) => {
            if (active === null || active.pointerId !== pointerId) return
            active = null
            try {
              target.releasePointerCapture?.(pointerId)
            } catch {
              // Capture may already be gone; the end is still reported.
            }
            offer(MoveEnded.make({ pointerId, completed }))
          }
          const listeners: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            [
              'pointerdown',
              event => {
                const pointer = event as PointerLike
                if ((pointer.button ?? 0) !== 0 || active !== null) return
                const pointerId = pointer.pointerId ?? 0
                active = { pointerId, x: pointer.clientX ?? 0, y: pointer.clientY ?? 0 }
                try {
                  target.setPointerCapture?.(pointerId)
                } catch {
                  // Without capture the move still reports while over the element.
                }
                offer(MoveStarted.make({ pointerId, pointerType: pointer.pointerType ?? 'mouse' }))
              },
            ],
            [
              'pointermove',
              event => {
                const pointer = event as PointerLike
                const pointerId = pointer.pointerId ?? 0
                if (active === null || active.pointerId !== pointerId) return
                offer(
                  Moved.make({
                    pointerId,
                    deltaX: (pointer.clientX ?? 0) - active.x,
                    deltaY: (pointer.clientY ?? 0) - active.y,
                    pointerType: pointer.pointerType ?? 'mouse',
                  }),
                )
              },
            ],
            ['pointerup', event => end((event as PointerLike).pointerId ?? 0, true)],
            ['pointercancel', event => end((event as PointerLike).pointerId ?? 0, false)],
            ['lostpointercapture', event => end((event as PointerLike).pointerId ?? 0, false)],
          ]
          for (const [type, listener] of listeners) element.addEventListener(type, listener)
          return { listeners, current: () => active }
        }),
        ({ listeners, current }) =>
          Effect.sync(() => {
            for (const [type, listener] of listeners) element.removeEventListener(type, listener)
            const pointer = current()
            if (pointer !== null) {
              try {
                ;(element as Capturing).releasePointerCapture?.(pointer.pointerId)
              } catch {
                // Already released.
              }
            }
          }),
      ),
    ),
})
