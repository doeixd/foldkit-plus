/**
 * Rating: a row of stars on the size ladder, each a radio with its native
 * look removed and a star cut by `clip-path` on its `::before`, so the
 * focus ring on the radio itself stays whole. A filled star takes the
 * `tone`; the rest are outlines' grey. Pointing at a star previews the
 * rating it would give, in CSS alone: the stars up to it fill, the ones
 * after it empty. `size` steps the stars with the ladder.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { RatingSlots } from '../rating.js'
import { component, disabled, focusRing, ref, steps, transition, variant } from './design.js'

const shape =
  'polygon(50% 0%, 61.8% 34.5%, 97.6% 34.5%, 68.7% 55.9%, 79.4% 90.5%, 50% 69.1%, 20.6% 90.5%, 31.3% 55.9%, 2.4% 34.5%, 38.2% 34.5%)'

// `:enabled` matches a radio that takes a choice, never a read-only mark (a `span`).
const pointed = '&:enabled:hover'

const tone = (fill: string) => ({
  star: variant(
    Style.pseudo('[data-filled="true"]::before', { background: fill }),
    Style.nest(`${pointed}::before, &:has(~ ${pointed})::before`, { background: fill }),
    // After the star pointed at, even a filled one empties: the preview is the rating it would give.
    Style.nest(`${pointed} ~ &::before`, { background: ref.outline.default }),
  ),
})

export const Rating = Style.recipeFor(RatingSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: ref.space['2xs'],
        '--_fk-rating-star': `calc(${ladder('icon')} * 1.5)`,
      }),
    ),
    label: component(
      Style.self({
        flexBasis: '100%',
        marginBlockEnd: ref.space['2xs'],
        color: ref.text.muted,
        ...role('caption'),
      }),
    ),
    star: component(
      Style.self({
        appearance: 'none',
        display: 'inline-grid',
        margin: '0',
        inlineSize: 'var(--_fk-rating-star)',
        blockSize: 'var(--_fk-rating-star)',
        borderRadius: ref.radius.sm,
      }),
      Style.pseudo(':enabled', { cursor: 'pointer' }),
      Style.pseudo('::before', {
        content: '""',
        clipPath: shape,
        background: ref.outline.default,
        ...transition('background'),
      }),
      focusRing,
      disabled,
    ),
  },
  variants: {
    tone: {
      warning: tone(ref.warning.default),
      accent: tone(ref.accent.default),
    },
    size: {
      sm: { root: steps.sm },
      md: { root: steps.md },
      lg: { root: steps.lg },
    },
  },
  defaults: { tone: 'warning' },
})
