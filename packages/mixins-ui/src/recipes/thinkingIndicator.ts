/**
 * An assistant at work: three dots rising in turn beside words that a band
 * of light sweeps across, as ChatGPT's and Claude's "Thinking…". Every
 * movement's duration is a travel's, so a still theme stills it, and reduced
 * motion holds it (the reset runs every animation for 0.01ms there, so a
 * sweep left running would flicker). Held, it still reads as at work: the
 * dots stand as a fading trail and the band rests across the middle of the
 * words, where a still animation would show its first frame, faint dots and
 * plain words that read as stopped.
 *
 * The axes:
 *
 * - `mark`: `dots` (the default) rising in turn; `pulse` one dot that
 *   breathes; `none` no mark, the words alone.
 * - `label`: `shimmer` (the default) the band sweeping across the words,
 *   the other way right to left; `plain` the words still; `hidden` the
 *   words said and not shown, the mark alone on the page.
 * - `tone`: `muted` (the default) the muted text with a band of the overt;
 *   `accent` the accent's ink.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { ThinkingIndicatorSlots } from '../thinkingIndicator.js'
import { component, ref, travelled, variant } from './design.js'

const ink = `var(--_fk-thinking-ink, ${ref.text.muted})`
const glint = `var(--_fk-thinking-glint, ${ref.text.overt})`
const still = Style.media('(prefers-reduced-motion: reduce)', { animation: 'none' })

// The image is two and a half times the words' width, its band in the middle,
// so at either end of the sweep the band is past an edge and the words are ink.
const sweep = Style.keyframes({
  from: { backgroundPosition: '100% 0' },
  to: { backgroundPosition: '0% 0' },
})

/**
 * Words a band of `--_fk-thinking-glint` sweeps across, in `--_fk-thinking-ink`:
 * a gradient clipped to the text, on the elements `where` selects (`&`, or a
 * state of it). Shared with the Thinking Steps' summary, which shimmers only
 * while running.
 */
export const shimmer = (where = '&'): StyleValue =>
  Style.compose(
    Style.nest(where, {
      color: 'transparent',
      backgroundImage: `linear-gradient(90deg, ${ink} 40%, ${glint} 50%, ${ink} 60%)`,
      backgroundSize: '250% 100%',
      // At rest, which a running sweep overrides: the band across the middle,
      // so a still theme's words still read as at work.
      backgroundPosition: '50% 0',
      backgroundRepeat: 'no-repeat',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      // About two seconds at the default motion.
      animation: `${sweep.name} ${travelled(`calc(${ref.motion.slow} * 8)`)} linear infinite`,
    }),
    sweep.style,
    Style.nest(`${where}:dir(rtl)`, { animationDirection: 'reverse' }),
    Style.at('@media (prefers-reduced-motion: reduce)', Style.nest(where, { animation: 'none' })),
  )

/** A dot's rise: about three quarters of a second a cycle. */
const cycle = travelled(`calc(${ref.motion.slow} * 3)`)

const rise = Style.keyframes({
  '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
  '30%': { transform: 'translateY(-40%)', opacity: '1' },
})
const breathe = Style.keyframes({
  '0%, 100%': { transform: 'scale(0.7)', opacity: '0.5' },
  '50%': { transform: 'scale(1)', opacity: '1' },
})

const hidden = Style.self({ display: 'none' })

export const ThinkingIndicator = Style.recipeFor(ThinkingIndicatorSlots)({
  base: {
    root: component(
      Style.self({
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: ref.space.xs,
        color: ink,
        ...role('body'),
      }),
    ),
    mark: component(
      Style.self({ display: 'inline-flex', alignItems: 'center', gap: '0.2em', flex: 'none' }),
    ),
    dot: component(
      Style.self({
        display: 'block',
        inlineSize: '0.375em',
        blockSize: '0.375em',
        borderRadius: ref.radius.full,
        background: 'currentColor',
      }),
    ),
    icon: component(
      Style.self({
        display: 'inline-grid',
        placeItems: 'center',
        inlineSize: '1em',
        blockSize: '1em',
      }),
      Style.nest('& > *', { inlineSize: '100%', blockSize: '100%' }),
    ),
    label: component(Style.self({})),
    // A line of its own, under the words.
    detail: component(Style.self({ flexBasis: '100%', color: ref.text.muted, ...role('caption') })),
  },
  variants: {
    mark: {
      dots: {
        dot: variant(
          // At rest, which the rise overrides: a fading trail, one dot to the next.
          Style.self({
            animation: `${rise.name} ${cycle} ease-in-out infinite`,
            opacity: 'var(--_fk-thinking-rest, 1)',
          }),
          rise.style,
          Style.nest('&:nth-child(2)', {
            animationDelay: `calc(${cycle} / 6)`,
            '--_fk-thinking-rest': '0.7',
          }),
          Style.nest('&:nth-child(3)', {
            animationDelay: `calc(${cycle} / 3)`,
            '--_fk-thinking-rest': '0.4',
          }),
          still,
        ),
      },
      pulse: {
        dot: variant(
          Style.self({
            inlineSize: '0.5em',
            blockSize: '0.5em',
            animation: `${breathe.name} ${cycle} ease-in-out infinite`,
          }),
          breathe.style,
          Style.nest('& + &', { display: 'none' }),
          still,
        ),
      },
      none: { mark: variant(hidden) },
    },
    label: {
      shimmer: { label: variant(shimmer()) },
      plain: {},
      hidden: { label: variant(Utilities.srOnly) },
    },
    tone: {
      muted: {},
      accent: {
        root: variant(
          Style.self({
            '--_fk-thinking-ink': ref.accent.ink,
            '--_fk-thinking-glint': ref.text.overt,
          }),
        ),
      },
    },
  },
  defaults: { mark: 'dots', label: 'shimmer', tone: 'muted' },
})
