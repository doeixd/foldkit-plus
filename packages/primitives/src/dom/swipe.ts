import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const SwipeStarted = Schema.TaggedStruct('SwipeStarted', {
  pointerId: Schema.Number,
  pointerType: Schema.String,
  /** The border box of what `measure` names (the element itself by default), as the swipe starts. */
  width: Schema.Number,
  height: Schema.Number,
})
export type SwipeStarted = typeof SwipeStarted.Type

export const Swiped = Schema.TaggedStruct('Swiped', {
  pointerId: Schema.Number,
  /** From where the pointer went down, in CSS pixels. */
  deltaX: Schema.Number,
  deltaY: Schema.Number,
})
export type Swiped = typeof Swiped.Type

export const SwipeEnded = Schema.TaggedStruct('SwipeEnded', {
  pointerId: Schema.Number,
  /** From where the pointer went down to where it came up, in CSS pixels. */
  deltaX: Schema.Number,
  deltaY: Schema.Number,
  /**
   * How fast the pointer was moving as it came up, in pixels a millisecond,
   * over the last `SWIPE_WINDOW` milliseconds: 0 when it rested there first.
   */
  velocityX: Schema.Number,
  velocityY: Schema.Number,
  /** `false` when the pointer was cancelled or capture was lost. */
  completed: Schema.Boolean,
})
export type SwipeEnded = typeof SwipeEnded.Type

export type SwipeFact = SwipeStarted | Swiped | SwipeEnded

/** How far back, in milliseconds, the release velocity looks. */
export const SWIPE_WINDOW = 100

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

interface Sample {
  readonly at: number
  readonly x: number
  readonly y: number
}

/**
 * The velocity of the samples within `SWIPE_WINDOW` of the last: the way
 * from the oldest of them to the last over the time between. A pointer that
 * came to rest before the last sample has no recent way to measure, so 0.
 */
export const velocityOf = (samples: ReadonlyArray<Sample>): { x: number; y: number } => {
  const last = samples.at(-1)
  if (last === undefined) return { x: 0, y: 0 }
  const first = samples.find(sample => last.at - sample.at <= SWIPE_WINDOW) ?? last
  const elapsed = last.at - first.at
  return elapsed <= 0
    ? { x: 0, y: 0 }
    : { x: (last.x - first.x) / elapsed, y: (last.y - first.y) / elapsed }
}

/**
 * `Move` with the speed of its release, for a gesture that a flick ends
 * (a sheet dragged to dismiss, a card swiped away): a primary-button pointer
 * down (or, given a `slop`, its first move past it) captures the pointer,
 * each move reports the delta from where it was pressed, and up reports the
 * last delta with the velocity over the last `SWIPE_WINDOW` milliseconds, by
 * the events' own time stamps. Cancel or lost capture ends it incomplete.
 * The start reports the size of what is moved, so a distance can be read as
 * a share of it. What a delta or a speed means is the parent's `update`.
 * Capture is released with the Mount.
 */
export const Swipe = Mount.defineStream('Swipe', {
  messages: [SwipeStarted, Swiped, SwipeEnded],
  args: {
    /**
     * The nearest ancestor matching this selector is measured as the swipe
     * starts, for what the swipe moves (a sheet's panel, dragged by its
     * handle). Default: the element itself.
     */
    measure: Schema.optional(Schema.String),
    /**
     * How far, in pixels, a press must move before it is a swipe. Until
     * then nothing is captured or reported, so a press that stays put is
     * still a click on whatever is under it (a tab inside a drag grip).
     * Default 0: the press itself starts the swipe.
     */
    slop: Schema.optional(Schema.Number),
  },
  execute: ({ element, measure, slop = 0 }) =>
    Stream.callback<SwipeFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const target = element as Capturing
          let active: {
            readonly pointerId: number
            readonly pointerType: string
            samples: Array<Sample>
            started: boolean
          } | null = null
          const offer = (fact: SwipeFact) => Queue.offerUnsafe(queue, fact)
          const sampleOf = (event: PointerLike): Sample => ({
            at: event.timeStamp,
            x: event.clientX ?? 0,
            y: event.clientY ?? 0,
          })
          const end = (event: PointerLike, completed: boolean) => {
            const pointerId = event.pointerId ?? 0
            if (active === null || active.pointerId !== pointerId) return
            const { samples, started } = active
            active = null
            // A press that never moved past the slop was a click, not a swipe.
            if (!started) return
            try {
              target.releasePointerCapture?.(pointerId)
            } catch {
              // Capture may already be gone; the end is still reported.
            }
            // A lost capture or a cancel carries no place: the last move's stands.
            const last = completed ? sampleOf(event) : (samples.at(-1) ?? sampleOf(event))
            const all = completed ? [...samples, last] : samples
            const start = all[0] ?? last
            const velocity = completed ? velocityOf(all) : { x: 0, y: 0 }
            offer(
              SwipeEnded.make({
                pointerId,
                deltaX: last.x - start.x,
                deltaY: last.y - start.y,
                velocityX: velocity.x,
                velocityY: velocity.y,
                completed,
              }),
            )
          }
          // Capture, and report the size of what is moved.
          const begin = (pointer: NonNullable<typeof active>) => {
            pointer.started = true
            try {
              target.setPointerCapture?.(pointer.pointerId)
            } catch {
              // Without capture the move still reports while over the element.
            }
            const moved = measure === undefined ? element : (element.closest(measure) ?? element)
            const box = moved.getBoundingClientRect()
            offer(
              SwipeStarted.make({
                pointerId: pointer.pointerId,
                pointerType: pointer.pointerType,
                width: box.width,
                height: box.height,
              }),
            )
          }
          const listeners: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            [
              'pointerdown',
              event => {
                const pointer = event as PointerLike
                if ((pointer.button ?? 0) !== 0 || active !== null) return
                active = {
                  pointerId: pointer.pointerId ?? 0,
                  pointerType: pointer.pointerType ?? 'mouse',
                  samples: [sampleOf(pointer)],
                  started: false,
                }
                if (slop <= 0) begin(active)
              },
            ],
            [
              'pointermove',
              event => {
                const pointer = event as PointerLike
                const pointerId = pointer.pointerId ?? 0
                if (active === null || active.pointerId !== pointerId) return
                const sample = sampleOf(pointer)
                const start = active.samples[0] ?? sample
                if (!active.started) {
                  if (Math.hypot(sample.x - start.x, sample.y - start.y) < slop) return
                  begin(active)
                }
                // Only what the velocity can still read, and where it began.
                active.samples = [
                  start,
                  ...active.samples.slice(1).filter(each => sample.at - each.at <= SWIPE_WINDOW),
                  sample,
                ]
                offer(
                  Swiped.make({
                    pointerId,
                    deltaX: sample.x - start.x,
                    deltaY: sample.y - start.y,
                  }),
                )
              },
            ],
            ['pointerup', event => end(event as PointerLike, true)],
            ['pointercancel', event => end(event as PointerLike, false)],
            ['lostpointercapture', event => end(event as PointerLike, false)],
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
