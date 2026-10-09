/**
 * An icon at the type scale. The drawing fills the box; size is the only axis.
 */
import { Style } from 'foldkit-mixins'
import { IconSlots } from '../icon.js'
import { component, ref, variant } from './design.js'

const box = (size: string) => variant(Style.self({ width: size, height: size }))

export const Icon = Style.recipeFor(IconSlots)({
  base: {
    glyph: component(
      Style.self({
        display: 'inline-flex',
        flex: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'currentColor',
      }),
    ),
  },
  variants: {
    size: {
      sm: { glyph: box(ref.size.sm) },
      md: { glyph: box(ref.size.md) },
      lg: { glyph: box(ref.size.lg) },
    },
  },
  defaults: { size: 'md' },
})
