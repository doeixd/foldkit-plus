/**
 * A keyboard key: the mono face at extra-small size on a keycap, a hairline
 * plate with a heavier lower edge and a lit top inside it. A combination
 * sets its keys in a row with the joiner muted between them. Nothing here
 * varies; the recipe is the look, chosen once.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { KbdSlots } from '../kbd.js'
import { component, ref, trimmed } from './design.js'

export const Kbd = Style.recipeFor(KbdSlots)({
  base: {
    combo: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space['3xs'],
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }),
    ),
    joiner: component(Style.self({ ...role('micro'), color: ref.text.muted })),
    // The line trimmed to the capitals and the height given back as even
    // padding, so a letter sits in the middle of the key's face; untrimmed,
    // the mono face's taller ascent stood it a pixel high.
    key: component(
      Style.self({
        display: 'inline-block',
        ...trimmed,
        padding: '0.3rem 0.375rem',
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderBlockEndWidth: ref.border.thick,
        borderRadius: ref.radius.sm,
        background: ref.surface.muted,
        // The keycap: a lit top edge and a faint shade above the lower edge.
        boxShadow: `inset 0 ${ref.border.thin} 0 ${ref.surface.base}, inset 0 calc(-1 * ${ref.border.thin}) 0 ${ref.state.edge}`,
        fontFamily: ref.font.mono,
        ...role('micro'),
        fontVariantNumeric: 'tabular-nums',
        color: ref.text.default,
        whiteSpace: 'nowrap',
      }),
    ),
  },
})
