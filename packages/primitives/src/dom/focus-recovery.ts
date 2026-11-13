/**
 * Focus recovery for a view that removes what had focus: when the focused
 * descendant of a marked part leaves the document, focus moves to a fallback
 * instead of falling to the body.
 *
 * A part is an element carrying `FOCUS_RECOVERY_PART`; `part(h, { to })` writes
 * it. `FOCUS_RECOVERY_TO` names the fallback by id, read on the nearest part or
 * any marked ancestor inside the root, so a list names the input that owned it.
 * Without one, focus goes to the nearest following sibling, then the nearest
 * preceding sibling, then the nearest enclosing part that can take focus (a
 * tree row), and otherwise nowhere: recovery never guesses.
 *
 * Nested roots share one document's events but each owns only its own parts.
 * Focus the reader moved elsewhere, a part that moved rather than went, and
 * teardown leave focus alone.
 */
import { Effect, Schema, Stream } from 'effect'
import type { Attribute, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'

const PART_KEY = 'fk-focus-recovery-part'
const TO_KEY = 'fk-focus-recovery-to'

/** Marks a part whose removal may need a focus fallback. */
export const FOCUS_RECOVERY_PART = `data-${PART_KEY}`
/** Names a fallback by id, read on the part or the nearest marked ancestor. */
export const FOCUS_RECOVERY_TO = `data-${TO_KEY}`

/** What a part's element is written with; `to` is the fallback's id. */
export const part = <Message>(
  h: HtmlBuilder<Message>,
  options?: { readonly to?: string },
): ReadonlyArray<Attribute<Message>> => [
  h.DataAttribute(PART_KEY, ''),
  ...(options?.to === undefined ? [] : [h.DataAttribute(TO_KEY, options.to)]),
]

/** Elements that take focus, asked by attribute rather than by layout. */
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]'

/** The roots a recovery is attached to, so a nested one keeps its own parts. */
const roots = new WeakSet<Element>()

const eligible = (element: Element | undefined): element is HTMLElement =>
  element instanceof HTMLElement &&
  element.isConnected &&
  element.matches(FOCUSABLE) &&
  !element.matches(':disabled') &&
  element.closest('[inert], [hidden], [aria-hidden="true"]') === null

const firstFocusable = (container: Element): HTMLElement | undefined => {
  if (eligible(container)) return container
  for (const node of container.querySelectorAll(FOCUSABLE)) {
    if (eligible(node)) return node
  }
  return undefined
}

const lastFocusable = (container: Element): HTMLElement | undefined => {
  const candidates = container.querySelectorAll(FOCUSABLE)
  for (let index = candidates.length - 1; index >= 0; index--) {
    const node = candidates[index]
    if (eligible(node)) return node
  }
  return eligible(container) ? container : undefined
}

/** The fallback by id inside this root; an ambiguous or missing id finds none. */
const byId = (root: Element, id: string): HTMLElement | undefined => {
  const found = [root, ...root.querySelectorAll('[id]')].filter(node => node.id === id)
  return found.length === 1 ? firstFocusable(found[0]!) : undefined
}

/** The focused element, and the fallback its nearest marked ancestor names. */
interface Held {
  readonly element: HTMLElement
  readonly to: string | undefined
}

const heldFrom = (root: Element, target: EventTarget | null): Held | undefined => {
  if (!(target instanceof HTMLElement) || !root.contains(target)) return undefined
  let marked = false
  let to: string | undefined
  for (let node: Element | null = target; node !== null; node = node.parentElement) {
    // A nested root owns what is inside it, so this one claims nothing there.
    if (node !== root && roots.has(node)) return undefined
    if (node.hasAttribute(FOCUS_RECOVERY_PART)) marked = true
    if (to === undefined) {
      const named = node.getAttribute(FOCUS_RECOVERY_TO)
      if (named !== null && named !== '') to = named
    }
    if (node === root) break
  }
  return marked ? { element: target, to } : undefined
}

const nextFocusable = (from: Node | null): HTMLElement | undefined => {
  for (let node = from; node !== null; node = node.nextSibling) {
    if (node instanceof Element && !roots.has(node)) {
      const found = firstFocusable(node)
      if (found !== undefined) return found
    }
  }
  return undefined
}

const previousFocusable = (from: Node | null): HTMLElement | undefined => {
  for (let node = from; node !== null; node = node.previousSibling) {
    if (node instanceof Element && !roots.has(node)) {
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

interface Fallback {
  readonly root: Element
  readonly held: Held
  /** The record that removed the part, whose neighbours are still its own. */
  readonly record: MutationRecord
}

/**
 * Where focus goes after `held` leaves: the named fallback, the next sibling,
 * the previous sibling, the enclosing part, in that order.
 */
const fallbackFor = ({ root, held, record }: Fallback): HTMLElement | undefined => {
  if (held.to !== undefined) {
    const named = byId(root, held.to)
    if (named !== undefined) return named
  }
  return (
    nextFocusable(record.nextSibling) ??
    previousFocusable(record.previousSibling) ??
    ancestorFocusable(root, record.target)
  )
}

/** Focus recovery as a Mount: put it on the container that holds the parts. */
export const FocusRecovery = Mount.defineStream('FocusRecovery', {
  messages: [Schema.Never],
  execute: ({ element, viewStateChanges }) =>
    viewStateChanges.pipe(
      Stream.switchMap(state =>
        state === 'Live'
          ? Stream.callback<never>(() =>
              Effect.acquireRelease(
                Effect.sync(() => {
                  const doc = element.ownerDocument
                  roots.add(element)
                  let disposed = false
                  let held = heldFrom(element, doc.activeElement)

                  const entered = (event: Event) => {
                    held = heldFrom(element, event.target)
                  }
                  const left = () => {
                    const leaving = held
                    if (leaving === undefined) return
                    // Asked once the change that may have taken it is done: a part
                    // removed with focus in it keeps the claim, one the reader left does not.
                    queueMicrotask(() => {
                      if (disposed || held !== leaving) return
                      if (leaving.element.contains(doc.activeElement)) return
                      // Gone from the document: the observer answers the removal.
                      if (!leaving.element.isConnected) return
                      // A move drops focus on the way, and the observer puts it
                      // back. A task with nothing restored ends the claim.
                      setTimeout(() => {
                        if (disposed || held !== leaving) return
                        if (leaving.element.contains(doc.activeElement)) return
                        held = undefined
                      }, 0)
                    })
                  }

                  const changes = new MutationObserver(records => {
                    if (disposed || held === undefined) return
                    const leaving = held
                    let removing: MutationRecord | undefined
                    search: for (const record of records) {
                      for (const node of record.removedNodes) {
                        if (
                          node instanceof Element &&
                          (node === leaving.element || node.contains(leaving.element))
                        ) {
                          removing = record
                          break search
                        }
                      }
                    }
                    if (removing === undefined) return
                    const record = removing
                    queueMicrotask(() => {
                      if (disposed || !element.isConnected) return
                      const active = doc.activeElement
                      // Focus went somewhere since: never take it back.
                      if (active !== null && active !== doc.body && active.isConnected) return
                      // The part moved rather than went: put focus back on it.
                      if (leaving.element.isConnected) {
                        leaving.element.focus({ preventScroll: true })
                        return
                      }
                      if (held !== leaving) return
                      held = undefined
                      fallbackFor({ root: element, held: leaving, record })?.focus({
                        preventScroll: true,
                      })
                    })
                  })

                  element.addEventListener('focusin', entered)
                  element.addEventListener('focusout', left)
                  changes.observe(element, { childList: true, subtree: true })
                  return () => {
                    disposed = true
                    roots.delete(element)
                    changes.disconnect()
                    element.removeEventListener('focusin', entered)
                    element.removeEventListener('focusout', left)
                  }
                }),
                stop => Effect.sync(stop),
              ),
            )
          : Stream.never,
      ),
    ),
})
