/**
 * A modal dialog: the backdrop dims the page and the panel is a raised
 * surface. `size` is the panel's maximum width.
 */
import { Style } from 'foldkit-mixins'
import { DialogSlots } from '../dialog.js'
import { component, focusRing, self, token, variant, whenEnabled } from './design.js'

const width = (max: string) => variant(self({ maxInlineSize: `min(${max}, 100% - 2rem)` }))

export const Dialog = Style.recipeFor(DialogSlots)({
  base: {
    dialog: component(
      self({
        padding: '0',
        border: '0',
        background: 'transparent',
        color: token('text', 'default'),
        maxInlineSize: '100%',
        maxBlockSize: '100%',
      }),
      Style.pseudo('::backdrop', { background: 'transparent' }),
    ),
    backdrop: component(
      self({
        position: 'fixed',
        inset: '0',
        background: `color-mix(in oklch, ${token('surface', 'bedrock')} 45%, transparent)`,
      }),
    ),
    panel: component(
      self({
        position: 'relative',
        display: 'grid',
        gap: token('space', 'sm'),
        inlineSize: '100%',
        marginInline: 'auto',
        padding: token('space', 'lg'),
        border: `${token('border', 'thin')} solid ${token('outline', 'subtle')}`,
        borderRadius: token('radius', 'lg'),
        background: token('surface', 'base'),
        boxShadow: `0 1rem 3rem color-mix(in oklch, ${token('surface', 'bedrock')} 25%, transparent)`,
      }),
    ),
    title: component(
      self({
        margin: '0',
        color: token('text', 'overt'),
        fontFamily: token('font', 'heading'),
        fontSize: token('size', 'xl'),
        fontWeight: token('weight', 'semibold'),
        lineHeight: token('leading', 'tight'),
      }),
    ),
    description: component(self({ margin: '0', color: token('text', 'muted') })),
    closeButton: component(
      self({
        position: 'absolute',
        insetBlockStart: token('space', 'sm'),
        insetInlineEnd: token('space', 'sm'),
        padding: token('space', '2xs'),
        border: '0',
        borderRadius: token('radius', 'sm'),
        background: 'transparent',
        color: token('text', 'muted'),
        cursor: 'pointer',
      }),
      whenEnabled(':hover', {
        background: token('surface', 'muted'),
        color: token('text', 'overt'),
      }),
      focusRing,
    ),
  },
  variants: {
    size: {
      sm: { panel: width('24rem') },
      md: { panel: width('32rem') },
      lg: { panel: width('48rem') },
    },
  },
  defaults: { size: 'md' },
})
