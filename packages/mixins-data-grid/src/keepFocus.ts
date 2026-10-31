import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

/** The press listener is attached: the Mount's answer when it starts, which changes nothing. */
export const KeepingFocus = Schema.TaggedStruct('KeepingFocus', {})

/**
 * Keeps focus where it is when a press lands on the element: a choice's list
 * sits beside its combobox, so a press on an option would otherwise blur the
 * combobox, which commits the old draft before the option's click arrives.
 * Attached only while the list is open; it answers `KeepingFocus` when it
 * starts, so a Scene test can open the list.
 */
export const KeepFocus = Mount.defineStream('DataGridKeepFocus', {
  messages: [KeepingFocus],
  execute: ({ element }) =>
    Stream.callback<typeof KeepingFocus.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const keep = (event: Event) => event.preventDefault()
          element.addEventListener('mousedown', keep)
          Queue.offerUnsafe(queue, KeepingFocus.make({}))
          return keep
        }),
        keep => Effect.sync(() => element.removeEventListener('mousedown', keep)),
      ),
    ),
})
