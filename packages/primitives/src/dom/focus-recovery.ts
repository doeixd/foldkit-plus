import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { canTakeFocus, FOCUS_MARK, markOf, ownerAbove } from './focusable.js'

/** Where focus goes when the part that had it is gone, tried in order. */
export const Step = Schema.Union([
  Schema.Literals(['same', 'next', 'previous', 'parent', 'stop', 'owner']),
  Schema.Struct({ part: Schema.String }),
])
export type Step = typeof Step.Type

/** Dispatched, bubbling, from an owner that found no step to take: the next owner out decides. */
export const UNRECOVERED = 'foldkit-plus:focus-unrecovered'

interface Sibling {
  readonly element: HTMLElement
  readonly key: string | null
}

/** The part that held focus, and what a step needs of it after it is gone. */
interface Held {
  readonly focused: HTMLElement
  readonly part: HTMLElement
  readonly slot: string
  readonly key: string | null
  readonly parent: string | null
  /** The closest part around it, for `parent` without a parent mark. */
  readonly enclosing: HTMLElement | null
  /** Every part of its slot, in the order last seen while it was focused. */
  readonly siblings: ReadonlyArray<Sibling>
  /** The owners above the focused element, innermost first. */
  readonly chain: ReadonlyArray<Element>
}

const owns = (owner: Element, part: Element): boolean => ownerAbove(part) === owner

const partsOf = (owner: Element): ReadonlyArray<HTMLElement> =>
  Array.from(owner.querySelectorAll<HTMLElement>(`[data-${FOCUS_MARK.part}]`)).filter(part =>
    owns(owner, part),
  )

const ownersAbove = (from: Element): ReadonlyArray<Element> => {
  const chain: Array<Element> = []
  for (
    let owner = from.closest(`[data-${FOCUS_MARK.owner}]`);
    owner !== null;
    owner = ownerAbove(owner)
  ) {
    chain.push(owner)
  }
  return chain
}

/** Focus is on nothing, or is still on an element that can no longer hold it. */
const lost = (focused: HTMLElement): boolean => {
  const active = focused.ownerDocument.activeElement
  if (active === null || active === focused.ownerDocument.body) return true
  return active === focused && !canTakeFocus(focused)
}

/**
 * Recovers focus for a container of parts, as a Mount. While focus is on a
 * marked part (`FocusRecovery.behavior` draws the marks), the container
 * remembers it; when that element is removed, hidden, made `inert` or
 * `disabled` and focus is lost with it, focus goes to the first element the
 * part's `fallback` steps find, in the same task as the change and before the
 * browser's own fix-up. Nothing is done when focus has moved elsewhere, and
 * nested containers decide once: the innermost one, then outward through
 * `foldkit-plus:focus-unrecovered`. It sends no Message: the part's `OnFocus`
 * tells the Model where focus went.
 */
export const FocusRecovery = Mount.defineStream('FocusRecovery', {
  messages: [Schema.Never],
  args: {
    /** The steps for each part slot: `{ row: ['next', 'previous', { part: 'input' }] }`. */
    fallback: Schema.Record(Schema.String, Schema.Array(Step)),
  },
  execute: ({ element, fallback }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          let held: Held | undefined

          const hold = (focused: HTMLElement) => {
            // Focus inside a nested owner's part is, for this owner, in the part holding it.
            let part = focused.closest(`[data-${FOCUS_MARK.part}]`)
            while (part !== null && !owns(element, part)) {
              part = part.parentElement?.closest(`[data-${FOCUS_MARK.part}]`) ?? null
            }
            if (!(part instanceof HTMLElement)) {
              held = undefined
              return
            }
            const slot = markOf(part, 'part') ?? ''
            const enclosing = part.parentElement?.closest(`[data-${FOCUS_MARK.part}]`)
            held = {
              focused,
              part,
              slot,
              key: markOf(part, 'key'),
              parent: markOf(part, 'parent'),
              enclosing:
                enclosing instanceof HTMLElement && owns(element, enclosing) ? enclosing : null,
              siblings: partsOf(element)
                .filter(each => markOf(each, 'part') === slot)
                .map(each => ({ element: each, key: markOf(each, 'key') })),
              chain: ownersAbove(focused),
            }
          }

          // A part is found again by its slot and key as it is drawn now: a keyed
          // patch may have made a new element for the same row.
          const current = (slot: string, key: string | null, was: HTMLElement) => {
            if (key === null) return was.isConnected ? was : undefined
            return partsOf(element).find(
              part => markOf(part, 'part') === slot && markOf(part, 'key') === key,
            )
          }

          const candidates = (step: Step, now: Held): ReadonlyArray<HTMLElement | undefined> => {
            if (typeof step !== 'string') {
              return partsOf(element).filter(part => markOf(part, 'part') === step.part)
            }
            switch (step) {
              case 'same':
                return [current(now.slot, now.key, now.focused)]
              case 'next':
              case 'previous': {
                const at = now.siblings.findIndex(sibling =>
                  now.key === null ? sibling.element === now.part : sibling.key === now.key,
                )
                const around =
                  at === -1
                    ? []
                    : step === 'next'
                      ? now.siblings.slice(at + 1)
                      : now.siblings.slice(0, at).reverse()
                return around.map(sibling => current(now.slot, sibling.key, sibling.element))
              }
              case 'parent': {
                const named =
                  now.parent === null
                    ? undefined
                    : partsOf(element).find(
                        part =>
                          markOf(part, 'part') === now.slot && markOf(part, 'key') === now.parent,
                      )
                return [named ?? now.enclosing ?? undefined]
              }
              case 'stop':
                return partsOf(element).filter(part => part.getAttribute('tabindex') === '0')
              case 'owner':
                return element instanceof HTMLElement ? [element] : []
            }
          }

          const take = (target: HTMLElement | undefined): boolean => {
            if (target === undefined || !canTakeFocus(target)) return false
            // The page may be scrolled elsewhere: `focus()` alone would scroll to it.
            target.focus({ preventScroll: true })
            if (target.ownerDocument.activeElement !== target) return false
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            return true
          }

          const recover = (now: Held) => {
            // Decided once: a part drawn later must not take focus from a user who moved on.
            held = undefined
            const steps = Object.hasOwn(fallback, now.slot) ? (fallback[now.slot] ?? []) : []
            for (const step of steps) {
              for (const target of candidates(step, now)) if (take(target)) return
            }
            element.dispatchEvent(new CustomEvent(UNRECOVERED, { bubbles: true }))
          }

          // Whether this owner is the one to decide: focus is lost with the element, no
          // owner inside this one is still standing, and what was focused is really gone.
          // A part moved in the tree (a keyed reorder) loses focus though it is connected again.
          const decide = (passedOut: boolean, moved = false) => {
            const now = held
            if (now === undefined || !element.isConnected || !lost(now.focused)) return
            if (!passedOut) {
              const mine = now.chain.indexOf(element)
              if (mine === -1 || now.chain.slice(0, mine).some(inner => inner.isConnected)) return
              if (!moved && canTakeFocus(now.focused)) return
            }
            recover(now)
          }

          const entered = (event: Event) => {
            if (event.target instanceof HTMLElement) hold(event.target)
          }
          const left = (event: Event) => {
            const next = (event as FocusEvent).relatedTarget
            if (next instanceof Node) {
              // Moved inside: `focusin` takes it from here. Moved out: the user left.
              if (!element.contains(next)) held = undefined
              return
            }
            // Blur is dispatched in the middle of the change that causes it, and that
            // change's mutation records are delivered after this microtask: ask again
            // one hop later, or a part moved in the tree reads as one the user left.
            queueMicrotask(() =>
              queueMicrotask(() => {
                const now = held
                if (now === undefined) return
                decide(false)
                // A blur on a healthy element is the user's, and ends the claim.
                if (
                  held === now &&
                  canTakeFocus(now.focused) &&
                  now.focused.ownerDocument.activeElement !== now.focused
                ) {
                  held = undefined
                }
              }),
            )
          }
          const passed = (event: Event) => {
            if (event.target === element) return
            event.stopPropagation()
            decide(true)
          }
          const changes = new MutationObserver(records => {
            const now = held
            if (now === undefined) return
            const moved = records.some(record =>
              Array.from(record.removedNodes).some(node => node.contains(now.focused)),
            )
            if (!moved && canTakeFocus(now.focused)) {
              // Still where it was: remember the siblings as they are, for when it goes.
              if (records.some(record => record.type === 'childList')) hold(now.focused)
              return
            }
            decide(false, moved)
          })

          const active = element.ownerDocument.activeElement
          if (active instanceof HTMLElement && element.contains(active)) hold(active)
          element.addEventListener('focusin', entered)
          element.addEventListener('focusout', left)
          element.addEventListener(UNRECOVERED, passed)
          changes.observe(element, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['inert', 'hidden', 'disabled'],
          })
          return () => {
            changes.disconnect()
            element.removeEventListener('focusin', entered)
            element.removeEventListener('focusout', left)
            element.removeEventListener(UNRECOVERED, passed)
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})
