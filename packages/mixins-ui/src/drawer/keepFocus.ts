import { Effect, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { Behavior, Capability } from 'foldkit-mixins'
import { DrawerSlots } from './slots.js'

/**
 * The handle takes focus when the panel goes down with focus in its body,
 * which would otherwise drop it to the page as the body is hidden. Pass it
 * beside the style. Not a default: its Mount sends no Message, which a Scene
 * test of every page drawing a Drawer could not resolve. A drag of the grip
 * is how a finger collapses it with focus still in the body.
 */
const HandleKeepsFocus = Mount.defineStream('DrawerKeepFocus', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const observer = new MutationObserver(() => {
            if (element.getAttribute('data-open') !== 'false') return
            const active = element.ownerDocument.activeElement
            const handle = element.querySelector<HTMLElement>('button[aria-expanded]')
            if (active !== null && active !== handle && element.contains(active))
              handle?.focus({ preventScroll: true })
          })
          observer.observe(element, { attributes: true, attributeFilter: ['data-open'] })
          return observer
        }),
        observer => Effect.sync(() => observer.disconnect()),
      ),
    ),
})

export const keepFocus = [
  Behavior.forSlots(DrawerSlots)<unknown, never>(
    {
      panel: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => HandleKeepsFocus(),
      }),
    },
    { name: 'DrawerKeepFocus' },
  ).mixin,
] as const
