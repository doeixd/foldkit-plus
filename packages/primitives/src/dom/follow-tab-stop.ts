import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { ROVING_MARK } from './focusable.js'

/**
 * Keeps focus that is inside a container of roving tab stops on its stop, as a
 * Mount: when a transition moves the stop (a row made current by a command the
 * container did not see, such as a duplicate) or removes the focused
 * descendant (a deleted row), focus goes to the descendant with
 * `tabindex="0"` (on a container marked `data-fk-roving`, the one no nested
 * roving container holds). It sends no Message. Focus outside the container is never
 * taken, and focus the user moved away stays where it went.
 */
export const FollowTabStop = Mount.defineStream('FollowTabStop', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          let within = element.contains(document.activeElement)
          const entered = () => {
            within = true
          }
          const left = (event: Event) => {
            const next = (event as FocusEvent).relatedTarget
            if (next instanceof Node && element.contains(next)) return
            const from = event.target
            // Asked once the change that may have taken it away is done: a descendant
            // removed with focus in it keeps the claim, one the user left does not.
            queueMicrotask(() => {
              if (!(from instanceof Node) || from.isConnected) within = false
            })
          }
          // A marked roving container's stop is the one no nested roving container
          // holds: a row holding another roving widget has a stop of its own.
          const stopOf = (): Element | null => {
            if (!element.hasAttribute(`data-${ROVING_MARK}`)) {
              return element.querySelector('[tabindex="0"]')
            }
            return (
              Array.from(element.querySelectorAll('[tabindex="0"]')).find(
                stop => stop.parentElement?.closest(`[data-${ROVING_MARK}]`) === element,
              ) ?? null
            )
          }
          const follow = () => {
            if (!within) return
            const stop = stopOf()
            const focused = document.activeElement
            if (!(stop instanceof HTMLElement) || stop === focused) return
            const lost = focused === null || focused === document.body
            const passed =
              focused !== null &&
              element.contains(focused) &&
              focused.getAttribute('tabindex') === '-1'
            if (lost || passed) stop.focus()
          }
          const changes = new MutationObserver(follow)
          element.addEventListener('focusin', entered)
          element.addEventListener('focusout', left)
          // A stop moved, or a descendant drawn or removed.
          changes.observe(element, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['tabindex'],
          })
          return () => {
            changes.disconnect()
            element.removeEventListener('focusin', entered)
            element.removeEventListener('focusout', left)
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})
