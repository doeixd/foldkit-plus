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

/**
 * What a swipe never starts on when its element `scrolls`: a field whose own
 * drag selects text or moves a thumb, and anything marked `data-no-swipe`.
 */
export const NO_SWIPE =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-swipe]'

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

/** A pointer or a touch being followed, from where it went down. */
interface Active {
  readonly pointerId: number
  readonly pointerType: string
  samples: Array<Sample>
  started: boolean
}

/** Every element a Swipe is mounted on: a touch inside one is that one's, not an outer one's. */
const owners = new WeakSet<Element>()

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
 * Whether anything from `target` up to `root` can still scroll along `axis`
 * the way a finger moving `along` (positive is down or right) pulls it: a
 * finger going down scrolls content toward its start.
 */
export const canScroll = (
  target: Element,
  root: Element,
  axis: 'x' | 'y',
  along: number,
): boolean => {
  for (let at: Element | null = target; at !== null; at = at.parentElement) {
    const overflow = getComputedStyle(at)[axis === 'y' ? 'overflowY' : 'overflowX']
    if (overflow === 'auto' || overflow === 'scroll') {
      const position = Math.abs(axis === 'y' ? at.scrollTop : at.scrollLeft)
      const room =
        axis === 'y' ? at.scrollHeight - at.clientHeight : at.scrollWidth - at.clientWidth
      if (room > 1 && (along > 0 ? position > 0.5 : position < room - 0.5)) return true
    }
    if (at === root) return false
  }
  return false
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
 *
 * Given `scrolls`, the element holds content that scrolls (a sheet's panel),
 * and a touch is followed by touch events, whose move can still refuse the
 * browser's scroll once the touch is under way, where a pointer's cannot:
 * past the slop, a touch that runs along the axis and finds nothing under it
 * that can scroll further its way swipes, and the browser scrolls any other.
 * A touch inside an element with a Swipe of its own (a handle in the panel)
 * is that one's, and none starts on a field or on `data-no-swipe`
 * (`NO_SWIPE`).
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
     * Default 0: the press itself starts the swipe; with `scrolls`, the
     * first move decides.
     */
    slop: Schema.optional(Schema.Number),
    /** The axis the element's content scrolls along, which a touch yields to; see above. */
    scrolls: Schema.optional(Schema.Literals(['x', 'y'])),
    /** Follows touches alone: a mouse or a pen is left to the page (and to a handle's own Swipe). */
    touchOnly: Schema.optional(Schema.Boolean),
  },
  execute: ({ element, measure, slop = 0, scrolls, touchOnly = false }) =>
    Stream.callback<SwipeFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const target = element as Capturing
          let active: Active | null = null
          const offer = (fact: SwipeFact) => Queue.offerUnsafe(queue, fact)
          const sampleOf = (at: number, x = 0, y = 0): Sample => ({ at, x, y })
          const end = (pointerId: number, last: Sample, completed: boolean, captured: boolean) => {
            if (active === null || active.pointerId !== pointerId) return
            const { samples, started } = active
            active = null
            // A press that never moved past the slop was a click, not a swipe.
            if (!started) return
            if (captured) {
              try {
                target.releasePointerCapture?.(pointerId)
              } catch {
                // Capture may already be gone; the end is still reported.
              }
            }
            // A lost capture or a cancel carries no place: the last move's stands.
            const final = completed ? last : (samples.at(-1) ?? last)
            const all = completed ? [...samples, final] : samples
            const start = all[0] ?? final
            const velocity = completed ? velocityOf(all) : { x: 0, y: 0 }
            offer(
              SwipeEnded.make({
                pointerId,
                deltaX: final.x - start.x,
                deltaY: final.y - start.y,
                velocityX: velocity.x,
                velocityY: velocity.y,
                completed,
              }),
            )
          }
          // Report the size of what is moved; a pointer's swipe also captures it.
          const begin = (pointer: Active, capture: boolean) => {
            pointer.started = true
            if (capture) {
              try {
                target.setPointerCapture?.(pointer.pointerId)
              } catch {
                // Without capture the move still reports while over the element.
              }
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
          const moved = (pointer: Active, sample: Sample) => {
            const start = pointer.samples[0] ?? sample
            // Only what the velocity can still read, and where it began.
            pointer.samples = [
              start,
              ...pointer.samples.slice(1).filter(each => sample.at - each.at <= SWIPE_WINDOW),
              sample,
            ]
            offer(
              Swiped.make({
                pointerId: pointer.pointerId,
                deltaX: sample.x - start.x,
                deltaY: sample.y - start.y,
              }),
            )
          }
          // A touch this Swipe follows: started in it, on nothing of another Swipe's or NO_SWIPE.
          const ownTouch = (from: EventTarget | null): from is Element => {
            if (!(from instanceof Element)) return false
            const field = from.closest(NO_SWIPE)
            if (field !== null && element.contains(field)) return false
            for (
              let at: Element | null = from;
              at !== null && at !== element;
              at = at.parentElement
            )
              if (owners.has(at)) return false
            return true
          }
          const touchOf = (event: TouchEvent, id: number) =>
            Array.from(event.changedTouches).find(touch => touch.identifier === id)
          let touched: Element | null = null
          const pointerListeners: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            [
              'pointerdown',
              event => {
                const pointer = event as PointerLike
                const type = pointer.pointerType ?? 'mouse'
                // Touch events follow a touch when the content scrolls.
                if (scrolls !== undefined && type === 'touch') return
                if (touchOnly && type !== 'touch') return
                if ((pointer.button ?? 0) !== 0 || active !== null) return
                active = {
                  pointerId: pointer.pointerId ?? 0,
                  pointerType: type,
                  samples: [sampleOf(pointer.timeStamp, pointer.clientX, pointer.clientY)],
                  started: false,
                }
                if (slop <= 0) begin(active, true)
              },
            ],
            [
              'pointermove',
              event => {
                const pointer = event as PointerLike
                if (active === null || active.pointerId !== (pointer.pointerId ?? 0)) return
                const sample = sampleOf(pointer.timeStamp, pointer.clientX, pointer.clientY)
                if (!active.started) {
                  const start = active.samples[0] ?? sample
                  if (Math.hypot(sample.x - start.x, sample.y - start.y) < slop) return
                  begin(active, true)
                }
                moved(active, sample)
              },
            ],
            ...(['pointerup', 'pointercancel', 'lostpointercapture'] as const).map(
              type =>
                [
                  type,
                  (event: Event) => {
                    const pointer = event as PointerLike
                    if (active?.pointerType === 'touch' && scrolls !== undefined) return
                    end(
                      pointer.pointerId ?? 0,
                      sampleOf(pointer.timeStamp, pointer.clientX, pointer.clientY),
                      type === 'pointerup',
                      true,
                    )
                  },
                ] as const,
            ),
          ]
          const touchListeners: ReadonlyArray<readonly [string, (event: Event) => void]> =
            scrolls === undefined
              ? []
              : [
                  [
                    'touchstart',
                    event => {
                      const touches = event as TouchEvent
                      const touch = touches.changedTouches[0]
                      if (active !== null || touches.touches.length !== 1 || touch === undefined)
                        return
                      if (!ownTouch(touches.target)) return
                      touched = touches.target as Element
                      active = {
                        pointerId: touch.identifier,
                        pointerType: 'touch',
                        samples: [sampleOf(touches.timeStamp, touch.clientX, touch.clientY)],
                        started: false,
                      }
                    },
                  ],
                  [
                    'touchmove',
                    event => {
                      const touches = event as TouchEvent
                      if (active === null) return
                      const touch = touchOf(touches, active.pointerId)
                      if (touch === undefined) return
                      const sample = sampleOf(touches.timeStamp, touch.clientX, touch.clientY)
                      if (!active.started) {
                        const start = active.samples[0] ?? sample
                        const dx = sample.x - start.x
                        const dy = sample.y - start.y
                        if (Math.hypot(dx, dy) < Math.max(slop, 1)) return
                        const along = scrolls === 'y' ? dy : dx
                        const across = scrolls === 'y' ? dx : dy
                        // Across the axis, into content that scrolls, or already
                        // the browser's: the page's, and followed no further.
                        if (
                          Math.abs(across) > Math.abs(along) ||
                          canScroll(touched ?? element, element, scrolls, along) ||
                          !touches.cancelable
                        ) {
                          active = null
                          return
                        }
                        begin(active, false)
                      }
                      touches.preventDefault()
                      moved(active, sample)
                    },
                  ],
                  ...(['touchend', 'touchcancel'] as const).map(
                    type =>
                      [
                        type,
                        (event: Event) => {
                          const touches = event as TouchEvent
                          if (active === null) return
                          const touch = touchOf(touches, active.pointerId)
                          if (touch === undefined) return
                          end(
                            active.pointerId,
                            sampleOf(touches.timeStamp, touch.clientX, touch.clientY),
                            type === 'touchend',
                            false,
                          )
                        },
                      ] as const,
                  ),
                ]
          owners.add(element)
          for (const [type, listener] of pointerListeners) element.addEventListener(type, listener)
          // Not passive: a move that swipes refuses the browser's scroll.
          for (const [type, listener] of touchListeners)
            element.addEventListener(type, listener, { passive: false })
          return { pointerListeners, touchListeners, current: () => active }
        }),
        ({ pointerListeners, touchListeners, current }) =>
          Effect.sync(() => {
            owners.delete(element)
            for (const [type, listener] of pointerListeners)
              element.removeEventListener(type, listener)
            for (const [type, listener] of touchListeners)
              element.removeEventListener(type, listener)
            const pointer = current()
            if (pointer !== null && !(pointer.pointerType === 'touch' && scrolls !== undefined)) {
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
