/**
 * An image that keeps its box. The `img` is a block no wider than its
 * container, its height following its ratio; a full-width one fills the
 * container. The placeholder paints its background until the picture covers
 * it. `fit` crops (`cover`) or letterboxes (`contain`) when a style sets a
 * ratio of its own; `ratio` is that ratio (`square`, `video` 16:9, `portrait` 3:4),
 * cropped at the asset's focal point; `radius` rounds the corners by the theme's
 * scale; `edge: 'line'` draws the faint inset line that keeps a pale image
 * apart from a pale page. With `Image.watchLoad`, an image whose file failed
 * hides, keeping its box. There is no fade: the placeholder is the `img`'s own
 * background, which any opacity on the `img` would fade with it.
 */
import { Style } from 'foldkit-mixins'
import { ImageSlots } from '../image.js'
import { component, imageEdge, ref, variant } from './design.js'

/** A crop to `ratio`, kept at the asset's focal point, and the box an unavailable image holds. */
const cropTo = (ratio: string) => ({
  image: variant(Style.self({ aspectRatio: ratio })),
  frame: variant(Style.nest('&[data-unavailable]', { aspectRatio: ratio })),
})

const corner = (radius: string) => ({ image: variant(Style.self({ borderRadius: radius })) })

export const Image = Style.recipeFor(ImageSlots)({
  base: {
    frame: component(
      Style.self({ display: 'block', maxInlineSize: '100%' }),
      // An image with no variant keeps the box it would have had.
      Style.nest('&[data-unavailable]', {
        aspectRatio: 'var(--fk-image-ratio)',
        inlineSize: 'var(--fk-image-width)',
      }),
      Style.nest('&[data-unavailable][data-layout="full"]', { inlineSize: '100%' }),
    ),
    image: component(
      Style.self({
        display: 'block',
        maxInlineSize: '100%',
        blockSize: 'auto',
        background: 'var(--fk-image-placeholder) center / cover no-repeat',
        objectPosition: 'var(--fk-image-focus, 50% 50%)',
      }),
      Style.nest('&[data-layout="full"]', { inlineSize: '100%' }),
      // Marked by `Image.watchLoad` alone.
      Style.nest('&[data-state="failed"]', { visibility: 'hidden' }),
    ),
  },
  variants: {
    fit: {
      cover: { image: variant(Style.self({ objectFit: 'cover' })) },
      contain: { image: variant(Style.self({ objectFit: 'contain' })) },
    },
    edge: {
      none: {},
      line: { image: variant(Style.self(imageEdge)) },
    },
    ratio: {
      auto: {},
      square: cropTo('1'),
      video: cropTo('16 / 9'),
      portrait: cropTo('3 / 4'),
    },
    radius: {
      none: {},
      sm: corner(ref.radius.sm),
      md: corner(ref.radius.md),
      lg: corner(ref.radius.lg),
      full: corner(ref.radius.full),
    },
  },
  defaults: { fit: 'cover', edge: 'none', ratio: 'auto', radius: 'none' },
})
