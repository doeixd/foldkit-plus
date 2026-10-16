import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/**
 * `key` as a left-to-right reader would press it: under `rtl` ArrowLeft and
 * ArrowRight swap, as Zag's `getEventKey` swaps them. A view reads its keys
 * through this, so its Messages and `update` take ArrowRight to mean "toward
 * the inline end" in either direction.
 */
export const readingKey = (key: string, direction: 'ltr' | 'rtl' | undefined): string => {
  if (direction !== 'rtl') return key
  if (key === 'ArrowLeft') return 'ArrowRight'
  if (key === 'ArrowRight') return 'ArrowLeft'
  return key
}

const directionOf = (element: Element): 'ltr' | 'rtl' =>
  element.matches(':dir(rtl)') ? 'rtl' : 'ltr'

/**
 * `readingKey` for a component whose keys an upstream bundle handles, which
 * no view option reaches: a keydown inside the element is read, before its
 * target's handler, as a left-to-right reader would press it, by the
 * element's own direction (`:dir(rtl)`, so the keys agree with the CSS). The
 * swapped key shadows the event's `key` getter for every handler after this
 * one.
 */
export const ReadingKeys = Mount.defineStream('ReadingKeys', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // An `Element`'s listeners are typed for any event.
          const read = (event: Event) => {
            if (!(event instanceof KeyboardEvent)) return
            const key = readingKey(event.key, directionOf(element))
            if (key !== event.key) Object.defineProperty(event, 'key', { value: key })
          }
          element.addEventListener('keydown', read, { capture: true })
          return () => element.removeEventListener('keydown', read, { capture: true })
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

/**
 * Writes the element's direction as `data-direction` and rewrites it when a
 * `dir` anywhere in the document changes it. Flipping `dir` moves a row's
 * items without resizing anything, so `Measure` on the same element, which
 * measures again on a change to it, would otherwise leave an indicator where
 * the first direction put it.
 */
export const FollowDirection = Mount.defineStream('FollowDirection', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const write = () => {
            const direction = directionOf(element)
            if (element.getAttribute('data-direction') !== direction) {
              element.setAttribute('data-direction', direction)
            }
          }
          const changes = new MutationObserver(write)
          changes.observe(document.documentElement, {
            subtree: true,
            attributes: true,
            attributeFilter: ['dir'],
          })
          write()
          return () => changes.disconnect()
        }),
        stop => Effect.sync(stop),
      ),
    ),
})
