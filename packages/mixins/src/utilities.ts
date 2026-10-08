/**
 * `foldkit-mixins/utilities`: one-idea pieces over the shipped scales, so
 * `Utilities.p('md')` is `padding: var(--fk-space-md)`. A step is a token name
 * of `Theme.tokens` (and a color a token name of `Theme.oklch`), so a step the
 * scale lacks is a type error and the value still follows the `density` knob
 * and a theme's overrides: the theme stays the one source of truth for sizes.
 *
 * Each is a rule on the element (`Style.self`), unlayered like the other
 * subpaths' pieces, so it takes the layer of the style it is composed into and
 * a plain declaration beside it wins per property. Compose them like any piece:
 * `[U.flex, U.gap('sm'), { color: t.text.muted }]`.
 */
import { self, type StyleValue } from './styleValue.js'
import { ref, VAR_PREFIX } from './theme/core.js'
import type { OklchTheme } from './theme/oklch.js'
import { tokens, type Tokens } from './theme/tokens.js'

const t = ref(tokens)

/** A space step, or none. */
export type Space = (keyof Tokens['space'] & string) | '0'
/** A margin step: a space step, or `auto`. */
export type Margin = Space | 'auto'

type Palette = Omit<OklchTheme, 'knob' | 'hue'>
/** A `Theme.oklch` color as `group.name`: `'surface.base'`, `'text.muted'`, `'accent.on-fill'`. */
export type ColorName = {
  readonly [G in keyof Palette & string]: `${G}.${keyof Palette[G] & string}`
}[keyof Palette & string]

const space = (step: Margin): string => (step === '0' || step === 'auto' ? step : t.space[step])

const colorRef = (name: ColorName): string => `var(${VAR_PREFIX}-${name.replace('.', '-')})`

const alignments = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
} as const

const justifications = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
} as const

export const Utilities = {
  /** `padding` on every side. */
  p: (step: Space): StyleValue => self({ padding: space(step) }),
  /** `padding-inline`. */
  px: (step: Space): StyleValue => self({ paddingInline: space(step) }),
  /** `padding-block`. */
  py: (step: Space): StyleValue => self({ paddingBlock: space(step) }),
  /** `margin` on every side. */
  m: (step: Margin): StyleValue => self({ margin: space(step) }),
  /** `margin-inline`; `mx('auto')` centers a block. */
  mx: (step: Margin): StyleValue => self({ marginInline: space(step) }),
  /** `margin-block`. */
  my: (step: Margin): StyleValue => self({ marginBlock: space(step) }),
  /** `gap` between flex or grid children. */
  gap: (step: Space): StyleValue => self({ gap: space(step) }),
  /** `font-size` from the size scale. */
  text: (size: keyof Tokens['size'] & string): StyleValue => self({ fontSize: t.size[size] }),
  /** `font-weight` from the weight scale. */
  font: (weight: keyof Tokens['weight'] & string): StyleValue =>
    self({ fontWeight: t.weight[weight] }),
  /** `line-height` from the leading scale. */
  leading: (name: keyof Tokens['leading'] & string): StyleValue =>
    self({ lineHeight: t.leading[name] }),
  /** `border-radius` from the radius scale. */
  rounded: (radius: keyof Tokens['radius'] & string): StyleValue =>
    self({ borderRadius: t.radius[radius] }),
  /** Text `color` from the palette. */
  color: (name: ColorName): StyleValue => self({ color: colorRef(name) }),
  /** `background` from the palette. */
  bg: (name: ColorName): StyleValue => self({ background: colorRef(name) }),
  /** `align-items` of a flex or grid container. */
  items: (align: keyof typeof alignments): StyleValue => self({ alignItems: alignments[align] }),
  /** `justify-content` of a flex or grid container. */
  justify: (justify: keyof typeof justifications): StyleValue =>
    self({ justifyContent: justifications[justify] }),
  flex: self({ display: 'flex' }),
  /** A flex column. */
  column: self({ display: 'flex', flexDirection: 'column' }),
  grid: self({ display: 'grid' }),
  block: self({ display: 'block' }),
  hidden: self({ display: 'none' }),
  wFull: self({ width: '100%' }),
  textCenter: self({ textAlign: 'center' }),
  uppercase: self({ textTransform: 'uppercase' }),
  /** One line, cut with an ellipsis. */
  truncate: self({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
  /** Visually hidden but announced: screen-reader-only content. */
  srOnly: self({
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  }),
  pointer: self({ cursor: 'pointer' }),
  selectNone: self({ userSelect: 'none' }),
} as const
