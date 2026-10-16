/**
 * What every recipe shares: typed token references, the layer each piece is
 * emitted in, and the focus and disabled treatments. The recipes assume a page
 * that ships `Theme.root` of `Theme.tokens` and a `Theme.oklch` palette from
 * `foldkit-mixins/theme`; a token name either lacks is a type error here.
 */
import { Layers, Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'

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

/**
 * A bounded control on the size ladder: its height, padding, gap and text
 * follow the `step` knob, so a region set compact shrinks it whole.
 */
export const onLadder: Declarations = {
  minBlockSize: Theme.ladder('height'),
  paddingBlock: '0',
  paddingInline: Theme.ladder('pad'),
  gap: Theme.ladder('gap'),
  ...Theme.role('body'),
}

/**
 * Letterforms centered in a box the ladder sizes: the line box trimmed to the
 * capital height and the baseline, so a label in a fixed-height control sits
 * optically centered. A browser without `text-box` draws the same box, since
 * the height is the ladder's, not the text's. It trims a block container's
 * lines only: on a flex container (the Button, whose icon and words are flex
 * items) it does nothing, and it does not inherit. It trims the top of the
 * first line and the bottom of the last, so a hidden line after the words
 * (`Utilities.steady`'s copy) takes the bottom trim: trim the words' own box.
 */
export const trimmed: Declarations = { textBox: 'trim-both cap alphabetic' }

/**
 * A field's text at 16px or more on a coarse pointer, where iOS Safari zooms
 * the page into any smaller focused field. Size only: the role's leading and
 * the field's height stay, and a fine pointer keeps the role.
 */
export const touchText: StyleValue = Style.media('(pointer: coarse)', {
  fontSize: `max(1rem, ${Theme.role('body').fontSize})`,
})

/** A row of a list on the ladder: a control's height, so it lines up with the trigger that opened it. */
export const rowOnLadder: Declarations = { ...onLadder, paddingInline: Theme.ladder('row-pad') }

/**
 * The steps a `size` axis chooses, set on the recipe's own element so a
 * chosen size beats the region it sits in; a recipe with no size follows the
 * region. `lg` is shadcn's third size, a half step up the ladder (40px).
 */
export const steps = {
  sm: variant(Style.self({ '--fk-knob-step': '1' })),
  md: variant(Style.self({ '--fk-knob-step': '0' })),
  lg: variant(Style.self({ '--fk-knob-step': '-0.5' })),
} as const

/** A hover rule that skips a disabled element. */
export const hover = (declarations: Declarations): StyleValue =>
  Style.pseudo(':hover:not([aria-disabled="true"], :disabled)', declarations)

export const focusRing: StyleValue = Style.pseudo(':focus-visible', {
  outline: `${ref.border.thick} solid ${ref.outline.focus}`,
  outlineOffset: '2px',
})

/**
 * The ring a group draws while the control inside it has focus. One piece,
 * not one per group, so the field group and the combobox agree on chrome
 * without copying it.
 */
export const focusWithin: StyleValue = Style.pseudo(':focus-within', {
  outline: `${ref.border.thick} solid ${ref.outline.focus}`,
  outlineOffset: '2px',
})

/** One capped scroll region for popup lists, in the `components` layer. */
export const listScroll: StyleValue = component(
  Style.self({ maxBlockSize: '16rem', overflowY: 'auto' }),
  Utilities.scrollFade('block'),
)

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
 * The right and bottom sides of a box, which a rotation turns into a chevron
 * or a check. Physical, not logical: the mark is a drawing, and logical sides
 * mirrored it under `dir="rtl"`, so every turn a recipe gives for right to
 * left landed a quarter off (a shut row's chevron pointed up).
 */
export const cornerSides = (width: string, color: string): Declarations => ({
  borderRight: `${width} solid ${color}`,
  borderBottom: `${width} solid ${color}`,
})

/** A duration for something that moves or resizes: reduced motion snaps it, while fades keep theirs. */
export const travelled = (duration: string) => `calc(${duration} * ${ref.knob.travel})`

/**
 * A surface that enters and leaves with `@foldkit/ui`'s animation states
 * (`isAnimated`): it fades and grows from `closed` on `tier`, and a leave
 * runs the quicker exit tween, since CSS takes the duration of the state it
 * enters. The growth travels, so reduced motion keeps only the fade. A
 * surface drawn without `isAnimated` carries no state and simply shows.
 */
export const presence = (tier: 'fast' | 'slow', closed: Declarations): StyleValue => {
  const timing = (duration: string, ease: string): Declarations => ({
    transitionDuration: `${duration}, ${travelled(duration)}, ${travelled(duration)}`,
    transitionTimingFunction: `${ease}, ${ease}, ${ease}`,
  })
  return Style.compose(
    Style.self({
      transitionProperty: 'opacity, scale, translate',
      ...timing(ref.motion[tier], ref.motion.ease),
    }),
    Style.pseudo('[data-closed]', { opacity: '0', ...closed }),
    Style.pseudo('[data-leave]', timing(ref.motion[`${tier}-exit`], ref.motion['ease-exit'])),
  )
}

/**
 * A heading row over a part that opens beneath it, `0fr` to `1fr` with no
 * measured height; the part clips itself (`minBlockSize: 0`, `overflow`).
 * Between the two, the container is taller than its rows, and `align-content`
 * left at `normal` stretched the heading into that room: the heading grew and
 * the opening part's text dropped, then rose back.
 */
export const opensBelow = (open: string): StyleValue =>
  Style.compose(
    Style.self({
      display: 'grid',
      gridTemplateRows: 'auto 0fr',
      alignContent: 'start',
      transitionProperty: 'grid-template-rows',
      transitionDuration: travelled(ref.motion['fast-exit']),
      transitionTimingFunction: ref.motion['ease-exit'],
    }),
    Style.pseudo(open, {
      gridTemplateRows: 'auto 1fr',
      transitionDuration: travelled(ref.motion.fast),
      transitionTimingFunction: ref.motion.ease,
    }),
  )

/**
 * The transition of an overlay a Mount places (a highlight, a chosen marker):
 * its place and size settle on `tier`, scaled by `moving` (a Mount's 0 or 1,
 * so a highlight appearing lands where it is), and its fade runs on `fast`.
 */
export const glide = (tier: 'fast' | 'moderate', moving: string): Declarations => {
  const duration = travelled(`calc(${ref.motion[tier]} * ${moving})`)
  return {
    transitionProperty: 'translate, inline-size, block-size, opacity',
    transitionDuration: `${duration}, ${duration}, ${duration}, ${ref.motion.fast}`,
    transitionTimingFunction: `${ref.motion.settle}, ${ref.motion.settle}, ${ref.motion.settle}, ${ref.motion.ease}`,
  }
}

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
  /** The fill while it is pressed: the family's `active`, a step deeper than its hover. */
  readonly fillActive: string
  readonly onFill: string
  readonly ink: string
  /** The line an outlined control draws: the fill, unless the fill is too pale for a line. */
  readonly line: string
  /**
   * What a hover over the tone is made of: its fill where hued, the theme's
   * ink elsewhere. A hued ancestor (an alert band) must not tint a neutral
   * control sitting on it, so the neutral tones name the theme's ink back.
   */
  readonly stateInk: string
}

const tone = (value: Tone): StyleValue =>
  variant(
    Style.self({
      '--_fk-tone-fill': value.fill,
      '--_fk-tone-fill-hover': value.fillHover,
      '--_fk-tone-fill-active': value.fillActive,
      '--_fk-tone-on-fill': value.onFill,
      '--_fk-tone-ink': value.ink,
      '--_fk-tone-line': value.line,
      '--_fk-state-ink': value.stateInk,
    }),
  )

/**
 * What a painted surface names as the state ink: its paint where the theme
 * lets surfaces name one, the element's own text elsewhere (`neutral`, as
 * before). A `var()` in a token substitutes where the token is declared, so
 * the ink cannot travel inside `state.hover`; it travels as its own property,
 * read where the film is drawn.
 */
export const surfaceInk = (paint: string): string =>
  `color-mix(in oklab, ${paint} calc(${ref.knob['surface-ink']} * 100%), currentColor)`

/**
 * The ground under an unfilled control on hover: the state ink, faint. The
 * ink is the theme's (`--fk-state-ink`: the text, or the accent's ink) unless
 * a painted surface above set `--_fk-state-ink` to its paint (an alert band,
 * a tone's fill), so a hover on blue is a deeper blue. The local name is
 * separate so that a neutral tone can name the theme's ink back: writing the
 * theme's own name on the element would hide the root's value from it. A
 * solid wash was near-white under the white text a colored band sets, and a
 * surface step vanished on a page of that step.
 */
export const unfilledHover = `color-mix(in oklab, var(--_fk-state-ink, ${ref.state.ink}) ${ref.knob['state-hover']}, transparent)`

/** A 1px hairline inside an image's edge, so a pale picture keeps its shape without a border changing its box. */
export const imageEdge: Declarations = {
  outline: `${ref.border.thin} solid ${ref.state.edge}`,
  outlineOffset: `calc(-1 * ${ref.border.thin})`,
}

export const toneVar = (
  name: 'fill' | 'fill-hover' | 'fill-active' | 'on-fill' | 'ink' | 'line',
): string => `var(--_fk-tone-${name})`

export const tones = {
  accent: tone({
    fill: ref.accent.default,
    fillHover: ref.accent.hover,
    fillActive: ref.accent.active,
    onFill: ref.accent['on-fill'],
    ink: ref.accent.ink,
    line: ref.accent.default,
    stateInk: surfaceInk(ref.accent.default),
  }),
  // A quiet grey that still reads as a control: the neutral surface step was
  // barely off the page, and as an outline's line it all but vanished.
  // See-through, as Fluid's secondary: it takes on the surface or tinted
  // band it sits on and never seams against it.
  neutral: tone({
    fill: ref.state.tint,
    fillHover: ref.state['tint-hover'],
    // Hovered it lightens, as Fluid's; pressed it darkens with its own text.
    fillActive: `color-mix(in oklab, ${ref.state.tint}, currentColor 10%)`,
    onFill: ref.text.overt,
    ink: ref.text.default,
    line: ref.outline.default,
    stateInk: ref.state.ink,
  }),
  /**
   * Neutral as dark as the page's text: a checked control that stands out
   * with no color, where the neutral surface would be a pale fill.
   */
  ink: tone({
    fill: ref.text.default,
    fillHover: ref.text.overt,
    fillActive: ref.text.overt,
    onFill: ref.surface.base,
    ink: ref.text.default,
    line: ref.text.default,
    stateInk: ref.state.ink,
  }),
  danger: tone({
    fill: ref.error.default,
    fillHover: ref.error.hover,
    fillActive: ref.error.active,
    onFill: ref.error['on-fill'],
    ink: ref.error.ink,
    line: ref.error.outline,
    stateInk: surfaceInk(ref.error.default),
  }),
} as const
