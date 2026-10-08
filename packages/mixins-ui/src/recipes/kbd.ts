/**
 * A keyboard key: the mono face at extra-small size on a hairline plate.
 * Nothing here varies; the recipe is the look, chosen once.
 */
import { Style } from 'foldkit-mixins'
import { KbdSlots } from '../kbd.js'
import { component, ref } from './design.js'

export const Kbd = Style.recipeFor(KbdSlots)({
  base: {
    key: component(
      Style.self({
        display: 'inline-block',
        padding: '0.1rem 0.375rem',
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderBlockEndWidth: ref.border.thick,
        borderRadius: ref.radius.sm,
        background: ref.surface.muted,
        fontFamily: ref.font.mono,
        fontSize: ref.size.xs,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: ref.leading.snug,
        color: ref.text.default,
        whiteSpace: 'nowrap',
      }),
    ),
  },
})
