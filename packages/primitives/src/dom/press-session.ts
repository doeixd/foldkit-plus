type Listener = readonly [
  type: string,
  listener: (event: Event) => void,
  options?: boolean | AddEventListenerOptions,
]

/**
 * Document listeners held only while a press is under way: `listen` attaches
 * them once, `release` takes them off. A Mount whose press may never come
 * keeps nothing on the document for its life.
 */
export const whilePressed = (owner: Document, listeners: ReadonlyArray<Listener>) => {
  let listening = false
  return {
    listen: () => {
      if (listening) return
      listening = true
      for (const [type, listener, options] of listeners)
        owner.addEventListener(type, listener, options)
    },
    release: () => {
      if (!listening) return
      listening = false
      for (const [type, listener, options] of listeners)
        owner.removeEventListener(type, listener, options)
    },
  }
}

/**
 * An Escape that ends a press is the press's, not also the focused element's
 * (a canvas that would deselect): heard on the way down, and stopped.
 */
export const escapeEnds =
  (pressed: () => boolean, end: () => void) =>
  (event: Event): void => {
    if (!pressed() || (event as KeyboardEvent).key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    end()
  }
