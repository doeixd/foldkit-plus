import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/**
 * Keeps focus where it is when a press lands on the element: a choice's list
 * sits beside its combobox, so a press on an option would otherwise blur the
 * combobox, which commits the old draft before the option's click arrives.
 * Attached only while the list is open.
 */
export const KeepFocus = Mount.defineStream('DataGridKeepFocus', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const keep = (event: Event) => event.preventDefault()
          element.addEventListener('mousedown', keep)
          return keep
        }),
        keep => Effect.sync(() => element.removeEventListener('mousedown', keep)),
      ),
    ),
})
