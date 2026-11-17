/**
 * Scrolls a caret into view by the least amount, as `scrollIntoView({ block: 'nearest' })` does
 * for an element, but for the caret's own rectangle: a tall block (code, a long paragraph) must
 * not bring its top into view when the caret is at its bottom.
 */

interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

const SCROLLING = /auto|scroll|overlay/

/** A scroll-padding length against the box it insets: pixels, or a percentage of its size. */
const inset = (value: string, size: number): number => {
  const length = parseFloat(value)
  if (Number.isNaN(length)) return 0
  return value.endsWith('%') ? (length / 100) * size : length
}

/** How far the box must move to hold `rect` between `start` and `end`; the nearest edge wins. */
const nearest = (start: number, end: number, from: number, to: number): number => {
  if (to - from > end - start) return from < start || to > end ? from - start : 0
  if (from < start) return from - start
  if (to > end) return to - end
  return 0
}

/**
 * The rectangle a collapsed range is drawn at. A browser gives none at an element's edge, in an
 * empty line or after a `<br>`, so the text beside it, the `<br>` at the caret, or the empty
 * line's own element stands for it.
 */
export const caretRect = (range: Range): Box | undefined => {
  // jsdom, where an application's unit tests run the editor, lays nothing out and gives a Range
  // no rectangles to read.
  if (typeof range.getClientRects !== 'function') return undefined
  const first = range.getClientRects()[0]
  if (first !== undefined) return first
  const { startContainer: node, startOffset: offset } = range
  // At an element's edge beside text, the text's own end is the caret.
  if (node instanceof Element) {
    const next = node.childNodes[offset]
    const previous = node.childNodes[offset - 1]
    const text = next instanceof Text ? next : previous instanceof Text ? previous : undefined
    if (text !== undefined && text.length > 0) {
      const edge = node.ownerDocument.createRange()
      edge.setStart(text, text === next ? 0 : text.length)
      return caretRect(edge)
    }
  }
  if (node instanceof Text && offset > 0) {
    const before = node.ownerDocument.createRange()
    before.setStart(node, offset - 1)
    before.setEnd(node, offset)
    const last = before.getClientRects()[0]
    if (last !== undefined) return { ...last.toJSON(), left: last.right, right: last.right }
  }
  const holder = node instanceof Element ? node : node.parentElement
  // An empty line is the whole of its element, padding included.
  if (holder !== null && holder.textContent === '') {
    const box = holder.getBoundingClientRect()
    if (box.height > 0) return box
  }
  for (const beside of node instanceof Element
    ? [node.childNodes[offset], node.childNodes[offset - 1]]
    : []) {
    if (beside instanceof Element) {
      const box = beside.getBoundingClientRect()
      if (box.height > 0) return box
    }
  }
  return undefined
}

/** Scrolls every scrolling ancestor of `from`, then the window, until `rect` is in view. */
export const reveal = (from: Element, rect: Box): void => {
  const view = from.ownerDocument.defaultView
  if (view === null) return
  let box = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
  const move = (
    scroll: (x: number, y: number) => void,
    visible: Box,
    style: CSSStyleDeclaration,
  ) => {
    const height = visible.bottom - visible.top
    const width = visible.right - visible.left
    const y = nearest(
      visible.top + inset(style.scrollPaddingTop, height),
      visible.bottom - inset(style.scrollPaddingBottom, height),
      box.top,
      box.bottom,
    )
    const x = nearest(
      visible.left + inset(style.scrollPaddingLeft, width),
      visible.right - inset(style.scrollPaddingRight, width),
      box.left,
      box.right,
    )
    if (x === 0 && y === 0) return
    scroll(x, y)
    box = { top: box.top - y, bottom: box.bottom - y, left: box.left - x, right: box.right - x }
  }
  const page = from.ownerDocument.documentElement
  for (let at = from.parentElement; at !== null && at !== page; at = at.parentElement) {
    const style = view.getComputedStyle(at)
    const scrolls =
      (SCROLLING.test(style.overflowY) && at.scrollHeight > at.clientHeight) ||
      (SCROLLING.test(style.overflowX) && at.scrollWidth > at.clientWidth)
    if (!scrolls) continue
    const edge = at.getBoundingClientRect()
    const scroller = at
    move(
      (x, y) => scroller.scrollBy({ left: x, top: y, behavior: 'instant' }),
      {
        top: edge.top + scroller.clientTop,
        left: edge.left + scroller.clientLeft,
        bottom: edge.top + scroller.clientTop + scroller.clientHeight,
        right: edge.left + scroller.clientLeft + scroller.clientWidth,
      },
      style,
    )
  }
  // The visual viewport is what a phone's on-screen keyboard shrinks.
  // Absent as `undefined` in jsdom, which has no viewport, where a browser without one says null.
  const visual = view.visualViewport ?? undefined
  move(
    (x, y) => view.scrollBy({ left: x, top: y, behavior: 'instant' }),
    visual === undefined
      ? { top: 0, left: 0, bottom: page.clientHeight, right: page.clientWidth }
      : {
          top: visual.offsetTop,
          left: visual.offsetLeft,
          bottom: visual.offsetTop + visual.height,
          right: visual.offsetLeft + visual.width,
        },
    view.getComputedStyle(page),
  )
}
