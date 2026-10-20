/**
 * Gestures for the touch browser tests: a finger's swipe, with the touch
 * events a touch screen sends, and a mouse's drag.
 */
const spin = (ms: number) => {
  const until = performance.now() + ms
  while (performance.now() < until) {}
}

export interface SwipeOptions {
  /** Down the screen (`y`, the default) or across it (`x`). */
  readonly axis?: 'x' | 'y'
  /** Sends the pointer events a touch screen sends beside the touch events, as a real finger does. */
  readonly pointers?: boolean
}

/**
 * A finger on `on`'s middle swiped `by` pixels down or right (up or left if
 * negative) in eight moves, spaced by a spin, not a sleep: the speed is read
 * from the events' times, which a loaded machine's timers stretch. Returns
 * how many moves refused the browser's scroll.
 */
export const swipe = (on: Element, by: number, options: SwipeOptions = {}): number => {
  const { axis = 'y', pointers = false } = options
  const box = on.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  const at = (moved: number) => (axis === 'y' ? { x, y: y + moved } : { x: x + moved, y })
  const touchAt = (moved: number) =>
    new Touch({ identifier: 3, target: on, clientX: at(moved).x, clientY: at(moved).y })
  const send = (type: string, touch: Touch, down: boolean) => {
    const event = new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: down ? [touch] : [],
      changedTouches: [touch],
    })
    on.dispatchEvent(event)
    return event.defaultPrevented
  }
  const point = (type: string, moved: number) =>
    pointers &&
    on.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 9,
        button: 0,
        pointerType: 'touch',
        clientX: at(moved).x,
        clientY: at(moved).y,
      }),
    )
  point('pointerdown', 0)
  send('touchstart', touchAt(0), true)
  let refused = 0
  for (let step = 1; step <= 8; step++) {
    spin(4)
    point('pointermove', (by * step) / 8)
    if (send('touchmove', touchAt((by * step) / 8), true)) refused++
  }
  point('pointerup', by)
  send('touchend', touchAt(by), false)
  return refused
}

/** A mouse drag on `on`, which only the handle answers. */
export const mouseDrag = (on: Element, by: number) => {
  const box = on.getBoundingClientRect()
  const at = (type: string, dy: number) =>
    on.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        button: 0,
        pointerType: 'mouse',
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2 + dy,
      }),
    )
  at('pointerdown', 0)
  for (let step = 1; step <= 8; step++) at('pointermove', (by * step) / 8)
  at('pointerup', by)
}
