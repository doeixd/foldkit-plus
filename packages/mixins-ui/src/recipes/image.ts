/**
 * An image that keeps its box. The `img` is a block no wider than its
 * container, its height following its ratio; a full-width one fills the
 * container. The placeholder paints its background until the picture covers
 * it. `fit` crops (`cover`) or letterboxes (`contain`) when a style sets a
 * ratio of its own; `edge: 'line'` draws the faint inset line that keeps a pale image
 * apart from a pale page.
 */
import { Style } from 'foldkit-mixins'
import { ImageSlots } from '../image.js'
import { component, imageEdge, variant } from './design.js'

export const Image = Style.recipeFor(ImageSlots)({
  base: {
    frame: component(Style.self({ display: 'block', maxInlineSize: '100%' })),
    image: component(
      Style.self({
        display: 'block',
        maxInlineSize: '100%',
        blockSize: 'auto',
        background: 'var(--fk-image-placeholder) center / cover no-repeat',
      }),
      Style.nest('&[data-layout="full"]', { inlineSize: '100%' }),
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
  },
  defaults: { fit: 'cover', edge: 'none' },
})
