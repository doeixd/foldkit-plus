import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { setOpenerRecovery } from './focus-way.js'
import { canTakeFocus, FOCUS_MARK, markOf, ownerAbove, take } from './focusable.js'

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

/** The part holding `focused` for `owner`, seen as focus recovery needs it, or `undefined` outside any. */
const holdOf = (owner: Element, focused: HTMLElement): Held | undefined => {
  // Focus inside a nested owner's part is, for this owner, in the part holding it.
  let part = focused.closest(`[data-${FOCUS_MARK.part}]`)
  while (part !== null && !owns(owner, part)) {
    part = part.parentElement?.closest(`[data-${FOCUS_MARK.part}]`) ?? null
  }
  if (!(part instanceof HTMLElement)) return undefined
  const slot = markOf(part, 'part') ?? ''
  const enclosing = part.parentElement?.closest(`[data-${FOCUS_MARK.part}]`)
  return {
    focused,
    part,
    slot,
    key: markOf(part, 'key'),
    parent: markOf(part, 'parent'),
    enclosing: enclosing instanceof HTMLElement && owns(owner, enclosing) ? enclosing : null,
    siblings: partsOf(owner)
      .filter(each => markOf(each, 'part') === slot)
      .map(each => ({ element: each, key: markOf(each, 'key') })),
    chain: ownersAbove(focused),
  }
}

// A part is found again by its slot and key as it is drawn now: a keyed
// patch may have made a new element for the same row.
const current = (owner: Element, slot: string, key: string | null, was: HTMLElement) => {
  if (key === null) return was.isConnected ? was : undefined
  return partsOf(owner).find(part => markOf(part, 'part') === slot && markOf(part, 'key') === key)
}

const candidates = (
  owner: Element,
  step: Step,
  now: Held,
): ReadonlyArray<HTMLElement | undefined> => {
  if (typeof step !== 'string') {
    return partsOf(owner).filter(part => markOf(part, 'part') === step.part)
  }
  switch (step) {
    case 'same':
      return [current(owner, now.slot, now.key, now.part)]
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
      return around.map(sibling => current(owner, now.slot, sibling.key, sibling.element))
    }
    case 'parent': {
      const named =
        now.parent === null
          ? undefined
          : partsOf(owner).find(
              part => markOf(part, 'part') === now.slot && markOf(part, 'key') === now.parent,
            )
      return [named ?? now.enclosing ?? undefined]
    }
    case 'stop':
      return partsOf(owner).filter(part => part.getAttribute('tabindex') === '0')
    case 'owner':
      return owner instanceof HTMLElement ? [owner] : []
  }
}

const recoverFrom = (
  owner: Element,
  fallback: Readonly<Record<string, ReadonlyArray<Step>>>,
  now: Held,
): boolean => {
  const steps = Object.hasOwn(fallback, now.slot) ? (fallback[now.slot] ?? []) : []
  for (const step of steps) {
    for (const target of candidates(owner, step, now)) if (take(target)) return true
  }
  return false
}

/** The fallbacks of each mounted owner, which an overlay's opener inside one reads. */
const fallbacks = new WeakMap<Element, Readonly<Record<string, ReadonlyArray<Step>>>>()

/**
 * Takes the opener's place among the parts of the `FocusRecovery` owner around
 * it, when the overlay opens: a removed opener has no neighbours left to read.
 * Returns what to run when the opener is gone: it focuses the first element
 * the owner's `fallback` steps for the opener's slot find, as they stand
 * then, and says whether one took focus. `undefined` when the opener is a part
 * of no owner. Registered with `focus-way`, which does not import this
 * module: a page with an overlay and no owner does not carry it.
 */
setOpenerRecovery(opener => {
  const owner = opener.closest(`[data-${FOCUS_MARK.owner}]`)
  if (owner === null) return undefined
  const held = holdOf(owner, opener)
  if (held === undefined) return undefined
  return () => {
    const fallback = fallbacks.get(owner)
    return fallback !== undefined && recoverFrom(owner, fallback, held)
  }
})

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
          // The owner is observed only while it holds a part: a page's patches elsewhere,
          // or while focus is outside, cost nothing.
          let observing = false
          const setHeld = (next: Held | undefined) => {
            held = next
            if (next !== undefined && !observing) {
              changes.observe(element, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['inert', 'hidden', 'disabled'],
              })
              observing = true
            } else if (next === undefined && observing) {
              changes.disconnect()
              observing = false
            }
          }

          const hold = (focused: HTMLElement) => setHeld(holdOf(element, focused))

          const recover = (now: Held) => {
            // Decided once: a part drawn later must not take focus from a user who moved on.
            setHeld(undefined)
            if (!recoverFrom(element, fallback, now)) {
              element.dispatchEvent(new CustomEvent(UNRECOVERED, { bubbles: true }))
            }
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
              if (!element.contains(next)) setHeld(undefined)
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
                  setHeld(undefined)
                }
              }),
            )
          }
          // Taken from an inner owner only by one that holds the part around it: an owner
          // between that holds none of it lets the event on to the owners further out.
          const passed = (event: Event) => {
            if (event.target === element || held === undefined) return
            event.stopPropagation()
            decide(true)
          }
          const drawsOrRemovesAPart = (record: MutationRecord): boolean =>
            record.type === 'childList' &&
            [...record.addedNodes, ...record.removedNodes].some(
              node =>
                node instanceof Element &&
                (node.hasAttribute(`data-${FOCUS_MARK.part}`) ||
                  node.querySelector(`[data-${FOCUS_MARK.part}]`) !== null),
            )
          const changes = new MutationObserver(records => {
            const now = held
            if (now === undefined) return
            const moved = records.some(record =>
              Array.from(record.removedNodes).some(node => node.contains(now.focused)),
            )
            if (!moved && canTakeFocus(now.focused)) {
              // Still where it was: remember the siblings as they are, for when it goes.
              if (records.some(drawsOrRemovesAPart)) hold(now.focused)
              return
            }
            decide(false, moved)
          })

          const active = element.ownerDocument.activeElement
          if (active instanceof HTMLElement && element.contains(active)) hold(active)
          fallbacks.set(element, fallback)
          element.addEventListener('focusin', entered)
          element.addEventListener('focusout', left)
          element.addEventListener(UNRECOVERED, passed)
          return () => {
            fallbacks.delete(element)
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
