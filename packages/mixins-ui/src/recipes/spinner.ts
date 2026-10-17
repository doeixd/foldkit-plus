/**
 * A loading wheel in one of five kinds: a `ring` turning (the default),
 * three `dots` rising in turn, three `bars` rising in turn, a disc that
 * `pulse`s outward, or a dot in `orbit` on a faint track. Every movement's
 * duration is a travel's, so a still theme stills it, and reduced motion
 * holds it (the reset runs every animation for 0.01ms there, so a breath
 * left running would flicker). `size` sizes it, `tone` inks it (the accent, the
 * muted text, or the text around it), and words shown beside it sit on
 * their line.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { SpinnerSlots } from '../spinner.js'
import { component, ref, travelled, turning, variant } from './design.js'

const size = 'var(--_fk-spinner-size)'
const ink = 'var(--_fk-spinner-ink)'
const track = `color-mix(in oklab, ${ink} 20%, transparent)`
/** One cycle of a kind's movement: about three quarters of a second at the default motion. */
const period = `calc(${ref.motion.slow} * 3)`
const cycle = travelled(period)

const rise = Style.keyframes({
  '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
  '40%': { transform: 'translateY(-50%)', opacity: '1' },
})
const grow = Style.keyframes({
  '0%, 80%, 100%': { transform: 'scaleY(0.4)', opacity: '0.5' },
  '40%': { transform: 'scaleY(1)', opacity: '1' },
})
const swell = Style.keyframes({
  from: { transform: 'scale(0.3)', opacity: '1' },
  to: { transform: 'scale(1)', opacity: '0' },
})
const still = Style.media('(prefers-reduced-motion: reduce)', { animation: 'none' })

/** The wheel of a kind, its parts, and the parts' turns: each a third of a cycle behind the last. */
const kind = (wheel: ReadonlyArray<StyleValue>, part: ReadonlyArray<StyleValue>) => ({
  wheel: variant(...wheel, still),
  part: variant(
    ...part,
    Style.nest('&:nth-child(2)', { animationDelay: `calc(${cycle} / -3 * 2)` }),
    Style.nest('&:nth-child(3)', { animationDelay: `calc(${cycle} / -3)` }),
    still,
  ),
})

const hidden = Style.self({ display: 'none' })

export const Spinner = Style.recipeFor(SpinnerSlots)({
  base: {
    wheel: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flex: 'none',
        inlineSize: size,
        blockSize: size,
        boxSizing: 'border-box',
        color: ink,
      }),
    ),
    part: component(Style.self({ display: 'block', background: 'currentColor' })),
    root: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space.xs,
        ...role('body'),
      }),
    ),
    text: component(Style.self({ color: ref.text.muted })),
  },
  variants: {
    kind: {
      ring: kind(
        [
          Style.self({
            borderRadius: ref.radius.full,
            border: `${ref.border.thick} solid ${track}`,
            borderTopColor: ink,
          }),
          turning(period),
        ],
        [hidden],
      ),
      dots: kind(
        [],
        [
          Style.self({
            inlineSize: '25%',
            blockSize: '25%',
            borderRadius: ref.radius.full,
            animation: `${rise.name} ${cycle} ease-in-out infinite`,
          }),
          rise.style,
        ],
      ),
      bars: kind(
        [],
        [
          Style.self({
            inlineSize: '20%',
            blockSize: '100%',
            borderRadius: ref.radius.xs,
            animation: `${grow.name} ${cycle} ease-in-out infinite`,
          }),
          grow.style,
        ],
      ),
      pulse: kind(
        [
          Style.self({
            borderRadius: ref.radius.full,
            background: ink,
            animation: `${swell.name} ${cycle} ease-out infinite`,
          }),
          swell.style,
        ],
        [hidden],
      ),
      // The wheel turns, carrying its first part round the track.
      orbit: kind(
        [
          Style.self({
            position: 'relative',
            borderRadius: ref.radius.full,
            border: `${ref.border.thick} solid ${track}`,
          }),
          turning(period),
        ],
        [
          Style.self({
            position: 'absolute',
            // Centred on the track, which runs through the middle of the border.
            insetBlockStart: `calc(-1 * ${ref.border.thick} / 2 - 12.5%)`,
            insetInlineStart: '37.5%',
            inlineSize: '25%',
            blockSize: '25%',
            borderRadius: ref.radius.full,
          }),
          Style.nest('& + &', { display: 'none' }),
        ],
      ),
    },
    size: {
      sm: { wheel: variant(Style.self({ '--_fk-spinner-size': '1rem' })) },
      md: { wheel: variant(Style.self({ '--_fk-spinner-size': '1.5rem' })) },
      lg: { wheel: variant(Style.self({ '--_fk-spinner-size': '2rem' })) },
    },
    tone: {
      accent: { wheel: variant(Style.self({ '--_fk-spinner-ink': ref.accent.default })) },
      neutral: { wheel: variant(Style.self({ '--_fk-spinner-ink': ref.text.muted })) },
      // The text around it, as in a button or a badge.
      current: { wheel: variant(Style.self({ '--_fk-spinner-ink': 'currentColor' })) },
    },
  },
  defaults: { kind: 'ring', size: 'md', tone: 'accent' },
})
