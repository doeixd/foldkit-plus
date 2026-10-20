/**
 * An icon. With no size it stands on the size ladder (16px, 14px compact),
 * so it steps with the control it sits in; a size fixes it to the type
 * scale. The drawing fills the box.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { IconSlots } from '../icon.js'
import { component, ref, variant } from './design.js'

const box = (size: string) => variant(Style.self({ inlineSize: size, blockSize: size }))

export const Icon = Style.recipeFor(IconSlots)({
  base: {
    glyph: component(
      Style.self({
        display: 'inline-flex',
        flex: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'currentColor',
        inlineSize: ladder('icon'),
        blockSize: ladder('icon'),
      }),
      // `Icon.draw` writes `1em` for a drawing that stands alone; in a glyph it fills the box.
      Style.nest('& > svg', { inlineSize: '100%', blockSize: '100%' }),
    ),
  },
  variants: {
    size: {
      sm: { glyph: box(ref.size.sm) },
      md: { glyph: box(ref.size.md) },
      lg: { glyph: box(ref.size.lg) },
    },
  },
})
