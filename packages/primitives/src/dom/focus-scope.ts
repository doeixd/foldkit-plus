import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { giveBack, returnOf } from './focus-return.js'
import { tabbableWithin } from './focusable.js'
import * as LayerStack from './layer-stack.js'

export { tabbableWithin }

const focusFirst = (elements: ReadonlyArray<HTMLElement>): boolean => {
  const first = elements[0]
  if (first === undefined) return false
  first.focus()
  return true
}

/**
 * A focus scope as a Mount: on insert it remembers what was focused, focuses
 * an initial element inside, and with `contain` keeps Tab and Shift+Tab
 * cycling inside; on unmount it gives focus back to what had it, or, when that
 * is gone, where `giveBack` finds a place (never `body` while a page element can
 * take it). It is a layer of the
 * document's stack while mounted, and a scope with a layer opened after it
 * still open contains nothing: the topmost layer owns containment, so a
 * dialog drawn beside this one, as a portaled one is, keeps its focus.
 * Nothing crosses to the
 * Model: which element had focus is a DOM fact, so this is element lifecycle,
 * not state. It emits no Messages.
 */
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
          const way = returnOf(element)
          const release = LayerStack.open(element)
          const focusInitial = () => {
            const initial =
              initialFocus === null ? null : element.querySelector<HTMLElement>(initialFocus)
            if (initial !== null) initial.focus()
            else if (!focusFirst(tabbableWithin(element)) && element instanceof HTMLElement) {
              element.focus()
            }
          }
          focusInitial()
          // Drawn where a lower layer hid it, nothing in it takes focus until that one stops
          // hiding it, and nothing outside it can take focus meanwhile: focus it then.
          const landed = () => element.contains(ownerDocument.activeElement)
          const stopWaiting = LayerStack.whenShown(() => {
            if (!landed()) focusInitial()
            if (landed()) stopWaiting()
          })
          if (landed()) stopWaiting()
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
            if (LayerStack.isCovered(element)) return
            focusFirst(tabbableWithin(element))
          }
          if (contain) {
            element.addEventListener('keydown', onKeyDown)
            ownerDocument.addEventListener('focusin', onFocusIn)
          }
          return { way, onKeyDown, onFocusIn, ownerDocument, release, stopWaiting }
        }),
        ({ way, onKeyDown, onFocusIn, ownerDocument, release, stopWaiting }) =>
          Effect.sync(() => {
            stopWaiting()
            const below = LayerStack.below(element)
            release()
            if (contain) {
              element.removeEventListener('keydown', onKeyDown)
              ownerDocument.removeEventListener('focusin', onFocusIn)
            }
            if (restore) giveBack(element, way, below)
          }),
      ),
    ),
})
