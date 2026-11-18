import { Effect, Queue, Stream } from 'effect'
import { TRACK_TARGET_ATTRIBUTE } from 'foldkit-primitives/dom'
import * as Mount from 'foldkit/mount'
import { Message } from './message.js'

/**
 * Moves the tour on when the reader presses the step's target through the
 * cutout, as a step that says "press Save" expects; the last step's press
 * ends it completed. Pass it as the view's `advanceOnClick`. The target is
 * read from the layer when the press lands, so the one listener serves every
 * step; it is on the dim, and attached only while the tour shows.
 */
export const advanceOnClick = Mount.defineStream('Tour.AdvanceOnClick', {
  messages: [Message.Next],
  execute: ({ element }) =>
    Stream.callback<ReturnType<typeof Message.Next>>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const pressed = (event: globalThis.Event) => {
            const id = element.parentElement?.getAttribute(TRACK_TARGET_ATTRIBUTE) ?? ''
            const target = id === '' ? null : document.getElementById(id)
            if (target !== null && event.target instanceof Node && target.contains(event.target))
              Queue.offerUnsafe(queue, Message.Next())
          }
          document.addEventListener('click', pressed, true)
          return pressed
        }),
        pressed => Effect.sync(() => document.removeEventListener('click', pressed, true)),
      ),
    ),
})

/** What the view's `advanceOnClick` takes: `Tour.advanceOnClick`. */
export type AdvanceOnClick = typeof advanceOnClick
