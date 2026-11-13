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
 * Nested containers share one document's events but each owns only its own
 * parts. Focus the reader moved elsewhere, a part that moved rather than went,
 * and teardown leave focus alone.
 */
import { Effect, Schema, Stream } from 'effect'
import type { Attribute, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import { containers, fallbackFor, nearestPart, PART_KEY, TO_KEY } from './focus-targets.js'

export { FOCUS_RECOVERY_PART, FOCUS_RECOVERY_TO } from './focus-targets.js'

/** What a part's element is written with; `to` is the fallback's id. */
export const part = <Message>(
  h: HtmlBuilder<Message>,
  options?: { readonly to?: string },
): ReadonlyArray<Attribute<Message>> => [
  h.DataAttribute(PART_KEY, ''),
  ...(options?.to === undefined ? [] : [h.DataAttribute(TO_KEY, options.to)]),
]

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
                  containers.add(element)
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
                      fallbackFor({
                        root: element,
                        to: leaving.to,
                        next: record.nextSibling,
                        previous: record.previousSibling,
                        enclosing: record.target,
                      })?.focus({ preventScroll: true })
                    })
                  })

                  element.addEventListener('focusin', entered)
                  element.addEventListener('focusout', left)
                  changes.observe(element, { childList: true, subtree: true })
                  return () => {
                    disposed = true
                    containers.delete(element)
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

/** The focused element, and the fallback its nearest part names. */
const heldFrom = (
  root: Element,
  target: EventTarget | null,
): { readonly element: HTMLElement; readonly to: string | undefined } | undefined => {
  if (!(target instanceof HTMLElement) || !root.contains(target)) return undefined
  const nearest = nearestPart(root, target)
  return nearest?.marked === true ? { element: target, to: nearest.to } : undefined
}
