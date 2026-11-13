/**
 * Content that is still drawn but no longer eligible: while an element carries
 * `LEAVING`, focus moves out of it and it becomes `inert`.
 *
 * `Presence` still owns how long that lasts. The view marks the part while its
 * presence phase is `hiding` (`leaving(h)`), and the marker goes when the same
 * phase is `shown` again or the part is removed. Nothing here times anything,
 * so there is no second exit timer beside the one that yields `Hidden`.
 *
 * Focus moves first and `inert` follows, because an inert ancestor cannot take
 * focus: the other order drops focus to the body. The fallback is
 * `FocusRecovery`'s, so a part that leaves in two steps — ineligible now,
 * removed later — lands in the same place whichever step takes focus first.
 * Removing the marker restores the part's own `inert` value and never takes
 * focus back: a `Show` leaves focus where the reader or a new surface put it.
 */
import { Effect, Schema, Stream } from 'effect'
import type { Attribute, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import { containers, fallbackFor, nearestPart } from './focus-targets.js'

const KEY = 'fk-leaving'

/** Marks a part as leaving: still drawn, no longer focusable or clickable. */
export const LEAVING = `data-${KEY}`

/** Whether the element is leaving, itself or as part of an ancestor's exit. */
export const isLeaving = (element: Element): boolean => element.closest(`[${LEAVING}]`) !== null

/** Marks an element as still drawn but no longer eligible for interaction. */
export const leaving = <Message>(h: HtmlBuilder<Message>): ReadonlyArray<Attribute<Message>> => [
  h.DataAttribute(KEY, ''),
]

/** The `inert` an element had before this package made it inert. */
interface Claim {
  readonly inert: boolean
}

const claims = new WeakMap<Element, Claim>()

/**
 * Leaving as a Mount: put it on the container that holds the parts. A part is
 * marked with `leaving(h)`; the container may also be the marked element.
 */
export const Leaving = Mount.defineStream('Leaving', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const doc = element.ownerDocument
          const held = new Set<Element>()
          let disposed = false

          const release = (root: Element) => {
            for (const node of [root, ...root.querySelectorAll('*')]) {
              // Another container's part stays its own claim, and a descendant
              // that is still leaving keeps the inert this container gave it.
              if (!held.has(node) || (node !== root && isLeaving(node))) continue
              const claim = claims.get(node)
              claims.delete(node)
              held.delete(node)
              if (claim !== undefined && node instanceof HTMLElement) node.inert = claim.inert
            }
          }

          const handOff = (part: Element) => {
            // A nested container owns what is inside it; its own Mount answers.
            const nearest = nearestPart(element, part)
            if (nearest === undefined || claims.has(part)) return
            claims.set(part, { inert: part instanceof HTMLElement && part.inert })
            held.add(part)
            const active = doc.activeElement
            if (active !== null && (active === part || part.contains(active))) {
              fallbackFor({
                root: element,
                to: nearest.to,
                next: part.nextSibling,
                previous: part.previousSibling,
                enclosing: part.parentElement,
              })?.focus({ preventScroll: true })
            }
            if (part instanceof HTMLElement) part.inert = true
          }

          const sweep = (root: Element) => {
            if (root.hasAttribute(LEAVING)) handOff(root)
            for (const part of root.querySelectorAll(`[${LEAVING}]`)) handOff(part)
          }

          const changes = new MutationObserver(records => {
            if (disposed) return
            // One microtask after this commit's own observers ran: an overlay's
            // `HideOutside` releases the rest of the page in the same batch, and
            // the fallback may be out there.
            queueMicrotask(() => {
              if (disposed) return
              for (const record of records) {
                if (record.type === 'attributes') {
                  const target = record.target
                  if (!(target instanceof Element)) continue
                  if (target.hasAttribute(LEAVING)) handOff(target)
                  else release(target)
                  continue
                }
                for (const node of record.addedNodes) {
                  if (node instanceof Element) sweep(node)
                }
                for (const node of record.removedNodes) {
                  if (node instanceof Element) release(node)
                }
              }
            })
          })

          changes.observe(element, {
            attributes: true,
            attributeFilter: [LEAVING],
            childList: true,
            subtree: true,
          })
          containers.add(element)
          sweep(element)
          return () => {
            disposed = true
            changes.disconnect()
            containers.delete(element)
            for (const part of held) {
              const claim = claims.get(part)
              claims.delete(part)
              if (claim !== undefined && part instanceof HTMLElement) part.inert = claim.inert
            }
            held.clear()
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})
