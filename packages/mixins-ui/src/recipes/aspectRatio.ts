/**
 * A frame held at one ratio. The content stretches to fill it; the ratio is
 * the only axis, so a square, a video frame, and a portrait share one look.
 */
import { Style } from 'foldkit-mixins'
import { AspectRatioSlots } from '../aspectRatio.js'
import { component, ref, variant } from './design.js'

export const AspectRatio = Style.recipeFor(AspectRatioSlots)({
  base: {
    frame: component(
      Style.self({
        display: 'grid',
        overflow: 'hidden',
        // The crop follows the page's corner. The ratio stays the only axis.
        borderRadius: ref.radius.md,
      }),
    ),
  },
  variants: {
    ratio: {
      square: { frame: variant(Style.self({ aspectRatio: '1' })) },
      video: { frame: variant(Style.self({ aspectRatio: '16 / 9' })) },
      portrait: { frame: variant(Style.self({ aspectRatio: '3 / 4' })) },
    },
  },
  defaults: { ratio: 'square' },
})
