import { Behavior, Capability } from 'foldkit-mixins'
import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { readingKey } from '../direction.js'
import { RadioGroupSlots } from './slots.js'

const forward = new Set(['ArrowRight', 'ArrowDown'])
const backward = new Set(['ArrowLeft', 'ArrowUp'])

/**
 * The key the group's own handler listens for, from the one pressed: both
 * pairs mean next and previous (the APG's radio group), whichever way the
 * group lies, and Left and Right swap under right to left. Upstream binds the
 * one pair of its orientation and knows no direction.
 */
const asOwnKey = (key: string, vertical: boolean, rtl: boolean): string => {
  const read = readingKey(key, rtl ? 'rtl' : 'ltr')
  if (forward.has(read)) return vertical ? 'ArrowDown' : 'ArrowRight'
  if (backward.has(read)) return vertical ? 'ArrowUp' : 'ArrowLeft'
  return key
}

const ArrowPairs = Mount.defineStream('RadioGroupArrowPairs', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // An `Element`'s listeners are typed for any event.
          const read = (event: Event) => {
            if (!(event instanceof KeyboardEvent)) return
            const key = asOwnKey(
              event.key,
              element.getAttribute('aria-orientation') === 'vertical',
              element.matches(':dir(rtl)'),
            )
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
 * Arrow keys as the APG asks: Right and Down are both next, Left and Up both
 * previous, in a row or a column, and right to left swaps Left and Right.
 * Upstream's handler on each option binds one pair and knows no direction,
 * and no view option reaches it, so this is a Mount that rewrites the key
 * before that handler reads it: the one keydown owner stays the option's. Pass it beside
 * the style. It is not built in because a Scene test must resolve every
 * Mount with a Message, and this one has none to give.
 */
export const readingKeys = Behavior.forSlots(RadioGroupSlots)<unknown, never>(
  {
    group: Behavior.slot({
      requires: { capability: Capability.Container },
      mount: () => ArrowPairs(),
    }),
  },
  { name: 'RadioGroupReadingKeys' },
).mixin
