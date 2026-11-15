import { EDGE_BAND, EDGE_SPEED, type EdgeScroll, REDUCED_STEP_MS } from './edge-scroll.js'

type Axis = 'x' | 'y'

interface Scroller {
  readonly element: Element
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  /** The lowest scroll offset: minus its room across for a right-to-left box, whose `scrollLeft` runs down from 0. */
  readonly low: number
}

const room = (element: Element, axis: Axis) =>
  axis === 'y'
    ? element.scrollHeight - element.clientHeight
    : element.scrollWidth - element.clientWidth

const offset = (element: Element, axis: Axis) =>
  axis === 'y' ? element.scrollTop : element.scrollLeft

const scrolls = (style: CSSStyleDeclaration, element: Element, axis: Axis) => {
  const overflow = axis === 'y' ? style.overflowY : style.overflowX
  return (
    (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') &&
    room(element, axis) > 0
  )
}

const lowOf = (style: CSSStyleDeclaration, element: Element, axis: Axis) =>
  axis === 'x' && style.direction === 'rtl' ? -room(element, axis) : 0

/** Whether the page itself can scroll that way: a scroll lock writes `overflow: hidden` on the root, which `scrollTo` would still move. */
const pageScrolls = (view: Window, owner: Document, axis: Axis) =>
  [owner.documentElement, owner.body].every(each => {
    if (each === null) return true
    const style = view.getComputedStyle(each)
    const overflow = axis === 'y' ? style.overflowY : style.overflowX
    return overflow !== 'hidden' && overflow !== 'clip'
  })

/** How hard a position pulls toward an edge of `lo`..`hi`: -1 to 1, by how deep into the strip it is. */
const pull = (at: number, lo: number, hi: number, band: number) => {
  const strip = Math.min(band, (hi - lo) / 3)
  if (strip <= 0) return 0
  if (at < lo + strip) return -Math.min(1, (lo + strip - at) / strip)
  if (at > hi - strip) return Math.min(1, (at - (hi - strip)) / strip)
  return 0
}

/**
 * Scrolls while `move` was last given a point near an edge of the nearest
 * ancestor of `element` that can scroll that way, one frame at a time, and
 * calls `onScrolled` after each so the caller measures again under the
 * still pointer. The frame loop runs only while something scrolls; `move`
 * starts it, and `stop` ends it.
 */
export const edgeScroller = (
  element: Element,
  options: EdgeScroll,
  onScrolled: () => void,
): { readonly move: (x: number, y: number) => void; readonly stop: () => void } => {
  const owner = element.ownerDocument
  const view = owner.defaultView
  const band = options.edge ?? EDGE_BAND
  const speed = options.speed ?? EDGE_SPEED
  let point: { readonly x: number; readonly y: number } | null = null
  let frame: number | undefined
  let last: number | undefined
  let owed = 0
  let reduced = false

  /** The ancestors that scroll, nearest first, then the page. Read each frame: layout may have moved. */
  const scrollers = (axis: Axis): ReadonlyArray<Scroller> => {
    if (view === null) return []
    const found: Array<Scroller> = []
    const root = owner.scrollingElement
    let fixed = false
    for (let at = element as Element | null; at !== null; at = at.parentElement) {
      if (at === owner.documentElement || at === owner.body || at === root) continue
      const style = view.getComputedStyle(at)
      if (scrolls(style, at, axis)) {
        const box = at.getBoundingClientRect()
        found.push({
          element: at,
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          low: lowOf(style, at, axis),
        })
      }
      // Nothing above a fixed box moves it: the page scrolling behind a fixed panel shows nothing new in it.
      if (style.position === 'fixed') {
        fixed = true
        break
      }
    }
    if (!fixed && root !== null && room(root, axis) > 0 && pageScrolls(view, owner, axis)) {
      found.push({
        element: root,
        left: 0,
        top: 0,
        right: owner.documentElement.clientWidth,
        bottom: owner.documentElement.clientHeight,
        low: lowOf(view.getComputedStyle(root), root, axis),
      })
    }
    return found
  }

  /** What each axis scrolls, as -1 to 1 of the speed, by the nearest ancestor that can go that way. */
  const plan = () => {
    const steps: Array<{ readonly element: Element; readonly axis: Axis; readonly by: number }> = []
    if (point === null) return steps
    for (const axis of ['x', 'y'] as const) {
      for (const scroller of scrollers(axis)) {
        // Beside a scroller, not over it, is no edge of its: the pointer must be within its span across.
        const across =
          axis === 'y'
            ? point.x >= scroller.left && point.x <= scroller.right
            : point.y >= scroller.top && point.y <= scroller.bottom
        if (!across) continue
        const by =
          axis === 'y'
            ? pull(point.y, scroller.top, scroller.bottom, band)
            : pull(point.x, scroller.left, scroller.right, band)
        if (by === 0) continue
        const at = offset(scroller.element, axis)
        const { low } = scroller
        if (by < 0 ? at <= low : at >= low + room(scroller.element, axis) - 0.5) continue
        steps.push({ element: scroller.element, axis, by })
        break
      }
    }
    return steps
  }

  const tick = (now: number) => {
    frame = undefined
    const steps = plan()
    if (steps.length === 0) return
    // The first frame has no earlier one to measure from: one at 60Hz.
    owed += last === undefined ? 1 / 60 : Math.max(0, Math.min(now - last, 50)) / 1000
    last = now
    // Reduced motion keeps the scroll, but in jumps, not a glide.
    if (reduced && owed * 1000 < REDUCED_STEP_MS) {
      frame = view?.requestAnimationFrame(tick)
      return
    }
    const seconds = owed
    let moved = false
    for (const { element: scroller, axis, by } of steps) {
      const before = offset(scroller, axis)
      // `instant`: a page's own `scroll-behavior: smooth` would glide each frame's step.
      scroller.scrollTo(
        axis === 'y'
          ? { top: before + by * speed * seconds, behavior: 'instant' }
          : { left: before + by * speed * seconds, behavior: 'instant' },
      )
      if (offset(scroller, axis) !== before) moved = true
    }
    if (moved) owed = 0
    // A step too small to move the scroll waits for more time; one that should have moved it
    // and did not (a page that will not scroll) ends the loop rather than spin.
    else if (seconds * speed >= 2) return
    if (moved) onScrolled()
    frame = view?.requestAnimationFrame(tick)
  }

  return {
    // Moves only ask for a frame: the frame decides whether anything scrolls, so moves faster
    // than frames walk the ancestors once a frame, not once a move.
    move: (x, y) => {
      point = { x, y }
      if (frame !== undefined || view === null) return
      last = undefined
      owed = 0
      reduced = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
      frame = view.requestAnimationFrame(tick)
    },
    stop: () => {
      point = null
      if (frame !== undefined) view?.cancelAnimationFrame(frame)
      frame = undefined
    },
  }
}
