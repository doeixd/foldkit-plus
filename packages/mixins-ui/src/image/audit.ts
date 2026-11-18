import { Effect, Schema, Stream } from 'effect'
import { Behavior, Capability } from 'foldkit-mixins'
import * as Mount from 'foldkit/mount'
import { ImageSlots } from './slots.js'

// The images drawn with priority, across the page: more than one is a warning.
const prioritized = new Set<Element>()

// A file at least this much narrower than the drawn width reads blurry; this much wider, wasted.
const BLURRY_BELOW = 0.9
const WASTED_ABOVE = 2.5

const Audit = Mount.defineStream('ImageAudit', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (!(element instanceof HTMLImageElement)) return () => {}
          const image = element
          const warn = (message: string) => console.warn(`Image.audit: ${message}`, image)
          if (image.getAttribute('fetchpriority') === 'high') {
            prioritized.add(image)
            if (prioritized.size > 1) {
              warn(
                `${prioritized.size} images are drawn with priority; give it to the page's largest alone`,
              )
            }
          }
          // `complete` can be true while the file's `load` is still queued: measure each file once.
          let measured = ''
          const measure = () => {
            const drawn = image.getBoundingClientRect().width * devicePixelRatio
            if (image.naturalWidth === 0 || drawn === 0 || image.currentSrc === measured) return
            measured = image.currentSrc
            const fact = `drawn ${Math.round(drawn)} device pixels wide from a ${image.naturalWidth}px file`
            if (image.naturalWidth < drawn * BLURRY_BELOW)
              warn(`${fact}: blurry, offer a wider candidate`)
            if (image.naturalWidth > drawn * WASTED_ABOVE)
              warn(`${fact}: wasted bytes, check its sizes`)
          }
          if (image.complete) measure()
          image.addEventListener('load', measure)
          return () => {
            prioritized.delete(image)
            image.removeEventListener('load', measure)
          }
        }),
        release => Effect.sync(release),
      ),
    ),
})

/**
 * Warnings for a development build, in the console, about what the page
 * left to itself: an image drawn wider than its file (blurry) or far
 * narrower (wasted bytes), from its natural width, its drawn width and the
 * device's pixel ratio; and more than one image drawn with `priority`. It
 * logs and changes nothing; like `watchLoad`, it sends no Message, so pass it
 * beside the style, and only where a page is being built.
 */
export const audit = [
  Behavior.forSlots(ImageSlots)<unknown, never>(
    {
      image: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Audit(),
      }),
    },
    { name: 'ImageAudit' },
  ).mixin,
]
