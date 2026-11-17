import { type DragPlace, boxOf } from './pointer-drag.js'

/** An element's computed style, or its first child's where it draws nothing itself (`display: contents`). */
const styleOf = (element: Element): CSSStyleDeclaration | undefined => {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  const child = element.firstElementChild
  return style?.display === 'contents' && child !== null ? styleOf(child) : style
}

/**
 * Where between the children of a container a pointer over the container's own space (its padding, the
 * gap between two children) would drop: before the first child whose middle, along the container's flow,
 * is past the pointer, else after the last. The children are the elements marked by `attribute` whose
 * nearest marked ancestor is `host`, or, with no `host`, the top ones of `scope`; an element marked by
 * `part` is a place inside a node, not a child. Only that one container's children are measured.
 *
 * `undefined` when the container has no children, so the caller keeps what it had. `null` when the pointer
 * is past the last child of `scope` itself: the page's own end. `skip` is a child that is no place, the
 * one being dragged among its own.
 */
export const gapPlace = (options: {
  readonly scope: Element
  readonly host: Element | null
  readonly attribute: string
  readonly part: string | undefined
  readonly x: number
  readonly y: number
  readonly skip: string | null
}): DragPlace | null | undefined => {
  const { scope, host, attribute, part, x, y, skip } = options
  const marked = part === undefined ? `[${attribute}]` : `[${attribute}]:not([${part}])`
  const children = Array.from(scope.querySelectorAll(marked)).filter(child => {
    const parent = child.parentElement?.closest(`[${attribute}]`) ?? null
    return host === null ? parent === null || !scope.contains(parent) : parent === host
  })
  const last = children.at(-1)
  if (last === undefined) return undefined
  // Measured as needed: the children lie in order along the flow, so the first past the pointer is
  // found by halving, and a container of hundreds of children costs a handful of measures.
  const [first, second] = [children[0], children[1]].map(child => child && boxOf(child))
  const style = styleOf(host ?? scope)
  const horizontal =
    first !== undefined && second !== undefined
      ? Math.abs(second.left + second.width / 2 - (first.left + first.width / 2)) >
        Math.abs(second.top + second.height / 2 - (first.top + first.height / 2))
      : style?.display.includes('flex') === true && style.flexDirection.startsWith('row')
  // A right-to-left row flows from the right: its first child is the rightmost.
  const sign = horizontal && style?.direction === 'rtl' ? -1 : 1
  const at = sign * (horizontal ? x : y)
  const pastMiddle = (child: Element) => {
    const box = boxOf(child)
    return at < sign * (horizontal ? box.left + box.width / 2 : box.top + box.height / 2)
  }
  const named = (child: Element, zone: 'before' | 'after'): DragPlace | null => {
    const id = child.getAttribute(attribute)
    return id === null || id === skip ? null : { id, zone }
  }
  let low = 0
  let high = children.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (pastMiddle(children[middle]!)) high = middle
    else low = middle + 1
  }
  const next = low
  const child = children[next]
  if (child !== undefined) return named(child, 'before')
  return host === null ? null : named(last, 'after')
}
