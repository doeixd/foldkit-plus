/**
 * What every recipe shares: typed token references, the layer each piece is
 * emitted in, and the focus and disabled treatments. The recipes assume a page
 * that ships `Theme.root` of `Theme.tokens` and a `Theme.oklch` palette from
 * `foldkit-mixins/theme`; a token name either lacks is a type error here.
 */
import { Layers, Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'

/**
 * `var(--fk-group-name)` for every token the shipped scales and palette
 * define. The palette is built only for its names: `Theme.ref` never reads a
 * value, so the accent here is irrelevant and the page's own palette applies.
 */
export const ref = Theme.ref(
  Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 0, c: 0, l: '50%' } })),
)

/** The base of a recipe, in the `components` layer. */
export const component = (...pieces: ReadonlyArray<StyleValue>): StyleValue =>
  Layers.standard.in('components', Style.compose(...pieces))

/** A variant or compound, in the `variants` layer, so it beats the base. */
export const variant = (...pieces: ReadonlyArray<StyleValue>): StyleValue =>
  Layers.standard.in('variants', Style.compose(...pieces))

/** A hover rule that skips a disabled element. */
export const hover = (declarations: Declarations): StyleValue =>
  Style.pseudo(':hover:not([aria-disabled="true"], :disabled)', declarations)

export const focusRing: StyleValue = Style.pseudo(':focus-visible', {
  outline: `${ref.border.thick} solid ${ref.outline.focus}`,
  outlineOffset: '2px',
})

export const disabled: StyleValue = Style.pseudo(':is([aria-disabled="true"], :disabled)', {
  opacity: '0.5',
  cursor: 'not-allowed',
})

export const transition = (properties: string): Declarations => ({
  transitionProperty: properties,
  transitionDuration: ref.motion.fast,
  transitionTimingFunction: ref.motion.ease,
})

/**
 * A tone is four private custom properties that the variants read: the fill,
 * its hover, the text on it, and the ink where nothing is filled. Tone and
 * variant are then independent axes with no compound per pair. An unfilled
 * control's hover is a tint of its own text (`unfilledHover`), so it reads on
 * any ground, a colored band included.
 */
interface Tone {
  readonly fill: string
  readonly fillHover: string
  readonly onFill: string
  readonly ink: string
}

const tone = (value: Tone): StyleValue =>
  variant(
    Style.self({
      '--_fk-tone-fill': value.fill,
      '--_fk-tone-fill-hover': value.fillHover,
      '--_fk-tone-on-fill': value.onFill,
      '--_fk-tone-ink': value.ink,
    }),
  )

/**
 * The ground under an unfilled control on hover: its own text color, faint.
 * A solid wash was near-white under the white text a colored band sets.
 */
export const unfilledHover = 'color-mix(in oklab, currentColor 12%, transparent)'

export const toneVar = (name: 'fill' | 'fill-hover' | 'on-fill' | 'ink'): string =>
  `var(--_fk-tone-${name})`

export const tones = {
  accent: tone({
    fill: ref.accent.default,
    fillHover: ref.accent.hover,
    onFill: ref.accent['on-fill'],
    ink: ref.accent.ink,
  }),
  neutral: tone({
    fill: ref.surface.default,
    fillHover: ref.surface.overt,
    onFill: ref.text.overt,
    ink: ref.text.default,
  }),
  danger: tone({
    fill: ref.error.default,
    fillHover: ref.error.outline,
    onFill: ref.error['on-fill'],
    ink: ref.error.ink,
  }),
} as const
