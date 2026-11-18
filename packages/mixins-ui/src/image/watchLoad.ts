import { Effect, Schema, Stream } from 'effect'
import { Behavior, Capability } from 'foldkit-mixins'
import * as Mount from 'foldkit/mount'
import { ImageSlots } from './slots.js'

/**
 * Marks the `img` with what became of its file: `data-state` is `loading`
 * until it arrives, then `loaded`, or `failed`. An image already complete when
 * it mounts (from the cache, or loaded before the page hydrated) is marked at
 * once, so it never fades in a second time. A later `src` keeps the mark it
 * has until its own file settles.
 */
const WatchLoad = Mount.defineStream('ImageLoad', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const mark = (state: string) => element.setAttribute('data-state', state)
          const settle = () =>
            mark(
              element instanceof HTMLImageElement && element.naturalWidth > 0 ? 'loaded' : 'failed',
            )
          const failed = () => mark('failed')
          if (element instanceof HTMLImageElement && element.complete) settle()
          else mark('loading')
          element.addEventListener('load', settle)
          element.addEventListener('error', failed)
          return { settle, failed }
        }),
        ({ settle, failed }) =>
          Effect.sync(() => {
            element.removeEventListener('load', settle)
            element.removeEventListener('error', failed)
          }),
      ),
    ),
})

/**
 * Marks the `img`'s `data-state` (`loading`, `loaded`, `failed`), for a style
 * to read; `Recipes.Image` hides a failed image, keeping its box, so no
 * broken-image glyph or stray alt text shows. Pass it beside the style. It
 * sends no Message, so it is never on by default; without it (or before a page
 * hydrates) the browser draws a failed image as it does.
 */
export const watchLoad = [
  Behavior.forSlots(ImageSlots)<unknown, never>(
    {
      image: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => WatchLoad(),
      }),
    },
    { name: 'ImageLoad' },
  ).mixin,
]
