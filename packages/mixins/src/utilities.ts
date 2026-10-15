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
import { compose, global, keyframes, nest, self, supports, type StyleValue } from './styleValue.js'
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

/** The fade's two ends, registered so a timeline can animate them: 1 is solid, 0 faded. */
const fadeEnds = global(
  '@property --_fk-fade-start{syntax:"<number>";inherits:false;initial-value:1}' +
    '@property --_fk-fade-end{syntax:"<number>";inherits:false;initial-value:1}',
)
const revealStart = keyframes({
  from: { '--_fk-fade-start': '1' },
  to: { '--_fk-fade-start': '0' },
})
const revealEnd = keyframes({ from: { '--_fk-fade-end': '0' }, to: { '--_fk-fade-end': '1' } })

const fade = (axis: 'block' | 'inline'): StyleValue => {
  const size = t.space['2xl']
  const mask = `linear-gradient(${axis === 'block' ? 'to bottom' : 'to right'}, rgb(0 0 0 / var(--_fk-fade-start)) 0, #000 ${size}, #000 calc(100% - ${size}), rgb(0 0 0 / var(--_fk-fade-end)) 100%)`
  return compose(
    fadeEnds,
    revealStart.style,
    revealEnd.style,
    supports('(animation-timeline: scroll())', {
      maskImage: mask,
      animation: `${revealStart.name} both linear, ${revealEnd.name} both linear`,
      animationTimeline: `scroll(self ${axis}), scroll(self ${axis})`,
      animationRangeStart: `0, calc(100% - ${size})`,
      animationRangeEnd: `${size}, 100%`,
    }),
  )
}
const fades = { block: fade('block'), inline: fade('inline') } as const

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
  /**
   * A scroller's content dissolving toward an edge with more to scroll, as
   * shadcn's `scroll-fade`: a mask whose two ends a scroll timeline moves, so
   * the true start and end stay crisp until something is past them. A browser
   * without scroll timelines (Firefox) gets no fade, since a still one would
   * sit on an edge with nothing beyond it. The gradient is physical, so in a
   * right-to-left page `inline` fades the left edge first.
   */
  scrollFade: (axis: 'block' | 'inline' = 'block'): StyleValue => fades[axis],
  /**
   * Room for a label at `weight`, so it turns heavier (chosen, pressed)
   * without moving what is beside it. The element's `data-label` holds the
   * label's text, which a hidden `::after` sets at that weight with no
   * height: a block as wide as its widest child takes the heavier width
   * whatever the label's own weight. The element stays a block container,
   * so a `text-box` trim on it still works; without `data-label`, nothing.
   * Hidden, the copy is no part of the element's accessible name: Chrome's
   * own accessibility tree names a steady button once. (Vitest's in-page
   * locator reads it twice, so a test presses such a button with `click()`.)
   */
  steady: (weight: keyof Tokens['weight'] & string): StyleValue =>
    nest('&[data-label]::after', {
      content: 'attr(data-label)',
      display: 'block',
      blockSize: '0',
      overflow: 'hidden',
      visibility: 'hidden',
      fontWeight: t.weight[weight],
    }),
} as const
