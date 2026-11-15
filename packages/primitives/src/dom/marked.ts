import { Option } from 'effect'

/**
 * The elements under `root` that carry `attribute`, in document order. Only
 * the attribute's name goes into the selector; values are read, never
 * written into one, so an id holding a quote or a bracket is safe.
 */
export const marked = (root: ParentNode, attribute: string): ReadonlyArray<Element> =>
  Array.from(root.querySelectorAll(`[${attribute}]`))

/** The first element under `root` whose `attribute` holds exactly `value`. */
export const markedWith = (
  root: ParentNode,
  attribute: string,
  value: string,
): Option.Option<Element> =>
  Option.fromUndefinedOr(
    marked(root, attribute).find(element => element.getAttribute(attribute) === value),
  )

/** Whether an element is drawn at all: one with `display: none`, or detached, has no box. */
export const isDrawn = (element: Element): boolean => element.getClientRects().length > 0
