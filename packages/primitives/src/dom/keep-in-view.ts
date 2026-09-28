/**
 * Keeps what is marked in view as a Mount: whenever an element in the mounted
 * one's subtree newly matches `selector`, such as the row just selected in a
 * list, it is scrolled into view the least amount that shows it (`nearest`).
 * The element keeps its identity and its focus: nothing is redrawn to move it.
 *
 * It watches with a `MutationObserver` for as long as it is mounted, which is as
 * long as the list or canvas that can change what is marked.
 */
import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const KeepInView = Mount.defineStream('KeepInView', {
  messages: [Schema.Never],
  args: {
    /** What is marked, as a selector within the element: `[aria-selected="true"]`. */
    selector: Schema.String,
  },
  execute: ({ element, selector }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          let marked = element.querySelector(selector)
          const observer = new MutationObserver(() => {
            const now = element.querySelector(selector)
            // Only a change of what is marked scrolls: the author's own scrolling stays.
            // A DOM with no layout (jsdom, in a test) has no scrollIntoView and nothing to scroll.
            if (now !== null && now !== marked && typeof now.scrollIntoView === 'function')
              now.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            marked = now
          })
          observer.observe(element, { subtree: true, childList: true, attributes: true })
          return observer
        }),
        observer => Effect.sync(() => observer.disconnect()),
      ),
    ),
})
