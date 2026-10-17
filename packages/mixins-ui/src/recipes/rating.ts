/**
 * Rating: a row of glyphs on the size ladder, each a radio with its native
 * look removed and the glyph cut by `clip-path` on its `::before`, so the
 * focus ring on the radio itself stays whole. The glyph is filled to
 * `--fk-rating-fill` by a hard-stopped gradient toward the inline end, so a
 * read-only 4.3 shows the last star a third full; a filled star takes the
 * `tone`, the rest outlines' grey. Pointing at a star previews the rating
 * it would give, in CSS alone: the stars up to it fill, the ones after it
 * empty. A half radio is half a star wide and shows its half of the glyph.
 * `glyph` picks the shape (a custom one is `--_fk-rating-shape` set in an
 * `.extend`), and `size` steps the stars with the ladder.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { RatingSlots } from '../rating.js'
import { component, disabled, focusRing, ref, steps, variant } from './design.js'

const star =
  'polygon(50% 0%, 61.8% 34.5%, 97.6% 34.5%, 68.7% 55.9%, 79.4% 90.5%, 50% 69.1%, 20.6% 90.5%, 31.3% 55.9%, 2.4% 34.5%, 38.2% 34.5%)'

// The classic heart curve (x = 16 sin³t, y = 13 cos t - 5 cos 2t - 2 cos 3t - cos 4t), sampled.
const heart = `polygon(${Array.from({ length: 36 }, (_, index) => {
  const t = (index / 36) * 2 * Math.PI
  const x = 16 * Math.sin(t) ** 3
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
  const at = (value: number) => `${Math.round(value * 10) / 10}%`
  return `${at(50 + (x / 34) * 100)} ${at(45 - (y / 34) * 100)}`
}).join(', ')})`

const circle = 'circle(42% at 50% 50%)'

// `:enabled` matches a radio that takes a choice, never a read-only mark (a `span`).
const pointed = '&:enabled:hover'

const size = 'var(--_fk-rating-star)'

export const Rating = Style.recipeFor(RatingSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        '--_fk-rating-star': `calc(${ladder('icon')} * 1.5)`,
        '--_fk-rating-shape': star,
        '--_fk-rating-on': ref.warning.default,
        '--_fk-rating-off': ref.outline.default,
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
        display: 'block',
        flex: 'none',
        margin: '0',
        // The gap after a whole star: between halves there is none.
        marginInlineEnd: ref.space['2xs'],
        inlineSize: size,
        blockSize: size,
        overflow: 'hidden',
        borderRadius: ref.radius.sm,
        '--fk-rating-fill': '0',
      }),
      Style.pseudo(':enabled', { cursor: 'pointer' }),
      Style.pseudo('[data-filled="true"]', { '--fk-rating-fill': '1' }),
      Style.pseudo('::before', {
        content: '""',
        display: 'block',
        inlineSize: size,
        blockSize: size,
        clipPath: 'var(--_fk-rating-shape)',
        background:
          'linear-gradient(to right, var(--_fk-rating-on) calc(var(--fk-rating-fill) * 100%), var(--_fk-rating-off) 0)',
      }),
      // Filling toward the inline end: from the right, right to left.
      Style.nest('&:dir(rtl)::before', {
        background:
          'linear-gradient(to left, var(--_fk-rating-on) calc(var(--fk-rating-fill) * 100%), var(--_fk-rating-off) 0)',
      }),
      // A half is half as wide, with no gap before its other half; the end half shows the glyph's end.
      Style.pseudo('[data-half="start"]', {
        inlineSize: `calc(${size} / 2)`,
        marginInlineEnd: '0',
      }),
      Style.nest('[data-half="start"] + &', { inlineSize: `calc(${size} / 2)` }),
      Style.nest('[data-half="start"] + &::before', { marginInlineStart: `calc(${size} / -2)` }),
      // The stars up to the one pointed at fill; after it, even a filled one empties.
      Style.nest(`${pointed}, &:has(~ ${pointed})`, { '--fk-rating-fill': '1' }),
      Style.nest(`${pointed} ~ &`, { '--fk-rating-fill': '0' }),
      focusRing,
      disabled,
    ),
    value: component(
      Style.self({ ...role('caption'), color: ref.text.default, marginInlineStart: ref.space.xs }),
    ),
  },
  variants: {
    tone: {
      warning: { root: variant(Style.self({ '--_fk-rating-on': ref.warning.default })) },
      accent: { root: variant(Style.self({ '--_fk-rating-on': ref.accent.default })) },
      error: { root: variant(Style.self({ '--_fk-rating-on': ref.error.default })) },
    },
    glyph: {
      star: {},
      heart: { root: variant(Style.self({ '--_fk-rating-shape': heart })) },
      circle: { root: variant(Style.self({ '--_fk-rating-shape': circle })) },
    },
    size: {
      sm: { root: steps.sm },
      md: { root: steps.md },
      lg: { root: steps.lg },
    },
  },
  defaults: { tone: 'warning', glyph: 'star' },
})
