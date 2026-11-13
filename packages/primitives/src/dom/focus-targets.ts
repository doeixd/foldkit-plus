/**
 * Where focus may go when content stops being eligible. Internal to this
 * package: `FocusRecovery` (the part was removed) and `Leaving` (the part is
 * still drawn but inert) both read it, so a row that leaves in two steps lands
 * in the same place whichever step takes focus first.
 *
 * The container registry is shared for the same reason: a nested widget owns
 * the parts inside it, and neither Mount strays across that boundary.
 */
export const PART_KEY = 'fk-focus-recovery-part'
export const TO_KEY = 'fk-focus-recovery-to'

/** Marks a part whose removal may need a focus fallback. */
export const FOCUS_RECOVERY_PART = `data-${PART_KEY}`
/** Names a fallback by id, read on the part or the nearest marked ancestor. */
export const FOCUS_RECOVERY_TO = `data-${TO_KEY}`

/** Elements that take focus, asked by attribute rather than by layout. */
export const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]'

/**
 * The containers that own the focus handling inside them. A container can carry
 * both a recovery Mount and a leaving Mount; each registration counts, and the
 * boundary stays until the last one releases it.
 */
const containerDepth = new WeakMap<Element, number>()

export const containers = {
  add: (element: Element): void => {
    containerDepth.set(element, (containerDepth.get(element) ?? 0) + 1)
  },
  delete: (element: Element): void => {
    const next = (containerDepth.get(element) ?? 0) - 1
    if (next <= 0) containerDepth.delete(element)
    else containerDepth.set(element, next)
  },
  has: (element: Element): boolean => containerDepth.has(element),
}

export const eligible = (element: Element | undefined): element is HTMLElement =>
  element instanceof HTMLElement &&
  element.isConnected &&
  element.matches(FOCUSABLE) &&
  !element.matches(':disabled') &&
  element.closest('[inert], [hidden], [aria-hidden="true"]') === null

export const firstFocusable = (container: Element): HTMLElement | undefined => {
  if (eligible(container)) return container
  for (const node of container.querySelectorAll(FOCUSABLE)) {
    if (eligible(node)) return node
  }
  return undefined
}

export const lastFocusable = (container: Element): HTMLElement | undefined => {
  const candidates = container.querySelectorAll(FOCUSABLE)
  for (let index = candidates.length - 1; index >= 0; index--) {
    const node = candidates[index]
    if (eligible(node)) return node
  }
  return eligible(container) ? container : undefined
}

/** The fallback by id inside this root; an ambiguous or missing id finds none. */
export const byId = (root: Element, id: string): HTMLElement | undefined => {
  const found = [root, ...root.querySelectorAll('[id]')].filter(node => node.id === id)
  return found.length === 1 ? firstFocusable(found[0]!) : undefined
}

/** What the nearest part at or above an element says about it. */
export interface NearestPart {
  /** The element or an ancestor carries `FOCUS_RECOVERY_PART`. */
  readonly marked: boolean
  /** The id the nearest part or marked ancestor names, if any. */
  readonly to: string | undefined
}

/**
 * The nearest part at or above `from`, bounded by `root`. Undefined when a
 * nested container owns `from`, so this container claims nothing there.
 */
export const nearestPart = (root: Element, from: Element): NearestPart | undefined => {
  let marked = false
  let to: string | undefined
  for (let node: Element | null = from; node !== null; node = node.parentElement) {
    if (node !== root && containers.has(node)) return undefined
    if (node.hasAttribute(FOCUS_RECOVERY_PART)) marked = true
    if (to === undefined) {
      const named = node.getAttribute(FOCUS_RECOVERY_TO)
      if (named !== null && named !== '') to = named
    }
    if (node === root) break
  }
  return { marked, to }
}

const nextFocusable = (from: Node | null): HTMLElement | undefined => {
  for (let node = from; node !== null; node = node.nextSibling) {
    if (node instanceof Element && !containers.has(node)) {
      const found = firstFocusable(node)
      if (found !== undefined) return found
    }
  }
  return undefined
}

const previousFocusable = (from: Node | null): HTMLElement | undefined => {
  for (let node = from; node !== null; node = node.previousSibling) {
    if (node instanceof Element && !containers.has(node)) {
      const found = lastFocusable(node)
      if (found !== undefined) return found
    }
  }
  return undefined
}

/** The nearest enclosing part that can take focus: a tree row above its list. */
const ancestorFocusable = (root: Element, from: Node | null): HTMLElement | undefined => {
  let node = from instanceof Element ? from : from === null ? null : from.parentElement
  for (; node !== null && node !== root; node = node.parentElement) {
    if (node.hasAttribute(FOCUS_RECOVERY_PART) && eligible(node)) return node
  }
  return undefined
}

export interface Fallback {
  readonly root: Element
  /** The fallback id a part or marked ancestor names. */
  readonly to: string | undefined
  /** The node after the part's own place; its next sibling when it is still drawn. */
  readonly next: Node | null
  readonly previous: Node | null
  /** Where to look for an enclosing part. */
  readonly enclosing: Node | null
}

/**
 * Where focus goes when a part stops being eligible: the named fallback, the
 * next sibling, the previous sibling, the enclosing part, in that order.
 */
export const fallbackFor = ({
  root,
  to,
  next,
  previous,
  enclosing,
}: Fallback): HTMLElement | undefined => {
  if (to !== undefined) {
    const named = byId(root, to)
    if (named !== undefined) return named
  }
  return nextFocusable(next) ?? previousFocusable(previous) ?? ancestorFocusable(root, enclosing)
}
