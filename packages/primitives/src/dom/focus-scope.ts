/**
 * A focus scope as a Mount: on insert it remembers what was focused, focuses
 * an initial element inside, and with `contain` keeps Tab and Shift+Tab
 * cycling inside; on unmount it gives focus back. Nothing crosses to the
 * Model: which element had focus is a DOM fact, so this is element lifecycle,
 * not state. It emits no Messages.
 */
import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
  '[contenteditable="true"]',
].join(', ')

const isVisible = (element: Element): boolean => {
  const probe = element as { checkVisibility?: () => boolean }
  return element.closest('[hidden], [inert]') === null && (probe.checkVisibility?.() ?? true)
}

/** Tabbable descendants in DOM order: focusable, visible, and not `tabindex="-1"`. */
export const tabbableWithin = (root: Element): ReadonlyArray<HTMLElement> =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    element => element.tabIndex >= 0 && isVisible(element),
  )

const focusFirst = (elements: ReadonlyArray<HTMLElement>): boolean => {
  const first = elements[0]
  if (first === undefined) return false
  first.focus()
  return true
}

export const FocusScope = Mount.defineStream('FocusScope', {
  messages: [Schema.Never],
  args: {
    /** Keep Tab, Shift+Tab, and a stray focus inside. */
    contain: Schema.Boolean,
    /** Give focus back to what had it, on unmount. */
    restore: Schema.Boolean,
    /** A selector inside the element to focus first; else the first tabbable
     *  descendant, else the element itself when it is focusable. */
    initialFocus: Schema.NullOr(Schema.String),
  },
  execute: ({ element, contain, restore, initialFocus }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const ownerDocument = element.ownerDocument
          const previous = ownerDocument.activeElement
          const initial =
            initialFocus === null ? null : element.querySelector<HTMLElement>(initialFocus)
          if (initial !== null) initial.focus()
          else if (!focusFirst(tabbableWithin(element)) && element instanceof HTMLElement) {
            element.focus()
          }
          const onKeyDown = (event: Event) => {
            const key = event as KeyboardEvent
            if (key.key !== 'Tab') return
            const tabbable = tabbableWithin(element)
            const first = tabbable[0]
            const last = tabbable[tabbable.length - 1]
            if (first === undefined || last === undefined) {
              key.preventDefault()
              return
            }
            const active = ownerDocument.activeElement
            if (key.shiftKey && (active === first || !element.contains(active))) {
              key.preventDefault()
              last.focus()
            } else if (!key.shiftKey && (active === last || !element.contains(active))) {
              key.preventDefault()
              first.focus()
            }
          }
          const onFocusIn = (event: Event) => {
            const target = event.target
            if (target instanceof Node && element.contains(target)) return
            focusFirst(tabbableWithin(element))
          }
          if (contain) {
            element.addEventListener('keydown', onKeyDown)
            ownerDocument.addEventListener('focusin', onFocusIn)
          }
          return { previous, onKeyDown, onFocusIn, ownerDocument }
        }),
        ({ previous, onKeyDown, onFocusIn, ownerDocument }) =>
          Effect.sync(() => {
            if (contain) {
              element.removeEventListener('keydown', onKeyDown)
              ownerDocument.removeEventListener('focusin', onFocusIn)
            }
            if (restore && previous instanceof HTMLElement && ownerDocument.contains(previous)) {
              previous.focus()
            }
          }),
      ),
    ),
})
