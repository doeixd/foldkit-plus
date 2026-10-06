import { Option, Schema } from 'effect'

export const FillDragStarted = Schema.TaggedStruct('FillDragStarted', {})
export const FillDraggedOver = Schema.TaggedStruct('FillDraggedOver', {
  /** The DOM id of the gridcell under the pointer. */
  cell: Schema.String,
})
export const FillDragEnded = Schema.TaggedStruct('FillDragEnded', {
  /** `false` when the pointer was cancelled or capture was lost. */
  completed: Schema.Boolean,
})
export type FillFact =
  typeof FillDragStarted.Type | typeof FillDraggedOver.Type | typeof FillDragEnded.Type

/** The attribute that marks the fill handle, which the body's listener looks for. */
export const fillHandleAttribute = 'data-fill-handle'

/** How far a press moves before it is a fill, so a stray click fills nothing. */
const threshold = 4
/** How near the grid's edge the pointer brings a scroll, and the fastest step a frame. */
const edge = 24
const fastest = 20

type PointerLike = Event & {
  readonly pointerId?: number
  readonly button?: number
  readonly clientX?: number
  readonly clientY?: number
}

interface Press {
  readonly pointerId: number
  readonly x: number
  readonly y: number
  /** Where the pointer is now, for the scroll that runs while it stays near an edge. */
  at: { x: number; y: number }
  dragging: boolean
  over: string
  frame: Option.Option<number>
}

/**
 * The fill handle dragged with the pointer, from the element that holds the
 * grid's cells, so the drag outlives the handle's own cell scrolling out of
 * the window. A press on the handle is kept from the cells (a press there
 * would select one instead). Once it has moved 4px the pointer is captured,
 * so the cell under it is found by where it is (`elementFromPoint`), not by
 * the event's target, which capture makes this element. While the pointer is
 * within 24px of the grid's edge, or past it, the grid scrolls toward it. The
 * listeners that follow the pointer, and the scroll, live for one press.
 *
 * Returns the cleanup, and whether a click now is the one a drag ended with.
 */
export const fillDragOn = (
  element: Element,
  offer: (fact: FillFact) => void,
): { readonly dispose: () => void; readonly owns: (event: Event) => boolean } => {
  const page = element.ownerDocument
  const view = page.defaultView
  let press: Option.Option<Press> = Option.none()
  // A drag ends with a click on the captured element, which is no click on a cell.
  let dragEnded = false
  const pointerOf = (event: Event) => (event as PointerLike).pointerId ?? 0
  const grid = () => Option.fromNullishOr(element.closest<HTMLElement>('[role="grid"]'))

  // Where to look for the cell: the pointer, held inside the grid's cells, so a
  // pointer past an edge (scrolling it) is over the cell at that edge. Below the
  // header row, which the rows scroll under, and inside any scrollbar.
  const probe = ({ x, y }: { readonly x: number; readonly y: number }) =>
    Option.match(grid(), {
      onNone: () => ({ x, y, toward: { x, y } }),
      onSome: box => {
        const rect = box.getBoundingClientRect()
        const header = box.querySelector('[role="row"][aria-rowindex="1"]')
        const top = header === null ? rect.top : header.getBoundingClientRect().bottom
        const clamp = (at: number, from: number, to: number) => Math.max(from, Math.min(to, at))
        const right = rect.left + box.clientWidth - 2
        const bottom = rect.top + box.clientHeight - 2
        return {
          x: clamp(x, rect.left + 1, right),
          y: clamp(y, top + 1, bottom),
          toward: { x: (rect.left + right) / 2, y: (top + bottom) / 2 },
        }
      },
    })
  // A scroll can reach past the rows drawn for the frame before, leaving a strip
  // at the edge with no cells: step toward the middle to the nearest drawn one.
  const cellAt = ({ x, y, toward }: ReturnType<typeof probe>) => {
    const steps = 48
    for (let step = 0; step <= steps; step++) {
      const found = page
        .elementFromPoint(x + ((toward.x - x) * step) / steps, y + ((toward.y - y) * step) / steps)
        ?.closest('[role="gridcell"]')
      if (found !== null && found !== undefined && found.id !== '') return Option.some(found.id)
    }
    return Option.none()
  }
  const report = (current: Press) => {
    const found = cellAt(probe(current.at))
    if (Option.isNone(found) || found.value === current.over) return
    current.over = found.value
    offer(FillDraggedOver.make({ cell: found.value }))
  }
  // How far to scroll this frame along one axis: toward an edge the pointer is near or past.
  const stepOf = (at: number, start: number, end: number) => {
    if (at < start + edge) return Math.max(-fastest, at - (start + edge))
    if (at > end - edge) return Math.min(fastest, at - (end - edge))
    return 0
  }
  const scroll = (current: Press) => {
    current.frame = Option.none()
    Option.match(grid(), {
      onNone: () => {},
      onSome: box => {
        const rect = box.getBoundingClientRect()
        const down = stepOf(current.at.y, rect.top, rect.bottom)
        const across = stepOf(current.at.x, rect.left, rect.right)
        if (down === 0 && across === 0) return
        // The cell under the pointer as the last scroll drew it: a scroll draws
        // its rows on the next frame, so what it brings in is read on that one.
        report(current)
        box.scrollBy(across, down)
        if (view !== null) {
          current.frame = Option.some(view.requestAnimationFrame(() => scroll(current)))
        }
      },
    })
  }

  const release = (current: Press) => {
    page.removeEventListener('pointermove', onMove)
    page.removeEventListener('pointerup', onUp)
    page.removeEventListener('pointercancel', onCancel)
    element.removeEventListener('lostpointercapture', onCancel)
    if (Option.isSome(current.frame)) view?.cancelAnimationFrame(current.frame.value)
    current.frame = Option.none()
    if (!current.dragging) return
    try {
      element.releasePointerCapture(current.pointerId)
    } catch {
      // Capture may already be gone.
    }
  }
  const finish = (event: Event, completed: boolean) => {
    const found = Option.filter(press, current => current.pointerId === pointerOf(event))
    if (Option.isNone(found)) return
    press = Option.none()
    release(found.value)
    if (!found.value.dragging) return
    dragEnded = true
    view?.setTimeout(() => (dragEnded = false), 0)
    offer(FillDragEnded.make({ completed }))
  }
  const onUp = (event: Event) => finish(event, true)
  const onCancel = (event: Event) => finish(event, false)
  const onMove = (event: Event) => {
    const found = Option.filter(press, current => current.pointerId === pointerOf(event))
    if (Option.isNone(found)) return
    const current = found.value
    const pointer = event as PointerLike
    current.at = { x: pointer.clientX ?? 0, y: pointer.clientY ?? 0 }
    if (!current.dragging) {
      const moved = Math.max(Math.abs(current.at.x - current.x), Math.abs(current.at.y - current.y))
      if (moved < threshold) return
      current.dragging = true
      try {
        element.setPointerCapture(current.pointerId)
      } catch {
        // Without capture the drag still follows the pointer on the page.
      }
      offer(FillDragStarted.make({}))
    }
    report(current)
    if (Option.isNone(current.frame)) scroll(current)
  }
  const onDown = (event: Event) => {
    const pointer = event as PointerLike
    const from = event.target
    if (!(from instanceof Element) || from.closest(`[${fillHandleAttribute}]`) === null) return
    event.stopPropagation()
    if ((pointer.button ?? 0) !== 0 || Option.isSome(press)) return
    // No text selection, and no focus taken from the grid.
    event.preventDefault()
    const x = pointer.clientX ?? 0
    const y = pointer.clientY ?? 0
    press = Option.some({
      pointerId: pointerOf(event),
      x,
      y,
      at: { x, y },
      dragging: false,
      over: '',
      frame: Option.none(),
    })
    page.addEventListener('pointermove', onMove)
    page.addEventListener('pointerup', onUp)
    page.addEventListener('pointercancel', onCancel)
    element.addEventListener('lostpointercapture', onCancel)
  }
  element.addEventListener('pointerdown', onDown)
  return {
    dispose: () => {
      element.removeEventListener('pointerdown', onDown)
      if (Option.isSome(press)) release(press.value)
      press = Option.none()
    },
    owns: event =>
      dragEnded ||
      (event.target instanceof Element &&
        event.target.closest(`[${fillHandleAttribute}]`) !== null),
  }
}
