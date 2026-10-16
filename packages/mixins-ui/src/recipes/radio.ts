/**
 * A radio group: circles that fill with a dot when `aria-checked`. `tone`
 * is the checked fill; `size` the control's box. The dot and the geometry
 * scale from the box like the Checkbox recipe's mark.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { RadioGroupSlots } from '../radioGroup.js'
import {
  component,
  disabled,
  focusRing,
  ref,
  tones,
  toneVar,
  transition,
  variant,
} from './design.js'

const checked = '[aria-checked="true"]'

const label = component(Style.self({ color: ref.text.default, ...role('body'), cursor: 'pointer' }))

const description = component(Style.self({ color: ref.text.muted, ...role('body') }))

/** The control's edge length; the dot scales from it. */
const box = (length: string) => variant(Style.self({ '--_fk-toggle-size': length }))

const sizes = {
  sm: box('0.875rem'),
  md: box('1rem'),
  lg: box('1.25rem'),
} as const

// With no size, the ladder's icon rung: 16px, 14px compact, as Fluid Functionalism's.
const edge = `var(--_fk-toggle-size, ${ladder('icon')})`

export const RadioGroup = Style.recipeFor(RadioGroupSlots)({
  base: {
    // A column unless the group says it is a row; upstream's groups are vertical by default.
    // A row wraps, so three plans on a phone become a second line instead of
    // overflowing it.
    group: component(
      Style.self({ display: 'flex', flexDirection: 'column', gap: ref.space['2xs'] }),
      Style.states(
        {
          // A wider gap across than down: the rows' words would otherwise run together.
          horizontal: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            columnGap: ref.space.md,
          },
        },
        'aria-orientation',
      ),
    ),
    option: component(
      Style.self({
        position: 'relative',
        display: 'inline-block',
        flexShrink: '0',
        inlineSize: edge,
        blockSize: edge,
        // Centered on the first line of a label beside it, in a row aligned
        // to its top: the body role gives `1lh` the label's leading. Aligned
        // by baseline instead, an empty radio stood its bottom on the line.
        ...role('body'),
        marginBlockStart: `calc((1lh - ${edge}) / 2)`,
        padding: '0',
        border: `${ref.border.thin} solid ${ref.outline.overt}`,
        borderRadius: ref.radius.full,
        background: ref.surface.base,
        cursor: 'pointer',
        ...transition('background-color, border-color'),
      }),
      // The checked ring reads DOM state, so it goes through `states`; the
      // dot below fuses state with `::after`, which declarations alone
      // cannot spell, so it stays a pseudo rule.
      Style.states({ true: { borderColor: toneVar('fill') } }, 'aria-checked'),
      // A dot centered in the circle, in the tone's fill. A whole-pixel
      // inset keeps it on whole pixels at every size: the padding box is
      // the edge minus a 1px rim each side (14px at md, 12 at sm, 18 at
      // lg), so 3px leaves an even remainder (8, 6, 12) split evenly.
      Style.pseudo(`${checked}::after`, {
        content: '""',
        position: 'absolute',
        inset: '3px',
        borderRadius: ref.radius.full,
        background: toneVar('fill'),
      }),
      focusRing,
      disabled,
    ),
    label,
    description,
    // A row: the radio on the first line of the words beside it.
    card: component(
      Style.self({
        display: 'flex',
        alignItems: 'flex-start',
        gap: ladder('gap'),
        cursor: 'pointer',
      }),
    ),
  },
  variants: {
    tone: {
      accent: { option: tones.accent },
      // Checked in the page's ink: the neutral surface was a pale fill under a dark dot.
      neutral: { option: tones.ink },
    },
    size: { sm: { option: sizes.sm }, md: { option: sizes.md }, lg: { option: sizes.lg } },
    variant: {
      plain: { group: variant(Style.self({})) },
      // Each option's `card` row is boxed; the chosen one takes the accent's
      // border and tint, which read in a dark scheme as in a light one.
      card: {
        group: variant(Style.self({ gap: ladder('gap') })),
        card: variant(
          Style.self({
            padding: ladder('row-pad'),
            border: `${ref.border.thin} solid ${ref.outline.subtle}`,
            borderRadius: ref.radius.lg,
            background: ref.surface.base,
            ...transition('background-color, border-color'),
          }),
          Style.nest(':where([aria-orientation="horizontal"]) > &', {
            flex: '1',
            minInlineSize: '12rem',
          }),
          Style.pseudo('[data-checked="true"]', {
            borderColor: ref.accent.default,
            background: ref.accent.subtle,
          }),
        ),
      },
    },
  },
  defaults: { tone: 'accent', variant: 'plain' },
})
