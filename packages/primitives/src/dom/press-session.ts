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
 * Escape ends a press. Once the press is under way (`started`) the Escape is
 * the press's, not also the focused element's (a canvas that would
 * deselect): heard on the way down, and stopped. Before that, a button merely
 * held down, it goes on to the page, whose dialog may be closing on it.
 */
export const escapeEnds =
  (pressed: () => boolean, started: () => boolean, end: () => void) =>
  (event: Event): void => {
    if (!pressed() || (event as KeyboardEvent).key !== 'Escape') return
    if (started()) {
      event.preventDefault()
      event.stopPropagation()
    }
    end()
  }
