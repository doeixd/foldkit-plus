/**
 * The theme the component pages draw in, and the knobs `/create` turns.
 *
 * A palette's tokens are CSS expressions over its `knob` tokens, but a custom
 * property resolves where it is declared: tokens declared on `:root` reach a
 * subtree already resolved, so a knob overridden there changes nothing. A
 * preview therefore declares the whole theme on its own element (`declared`),
 * and `/create` overrides the knobs inline on that same element
 * (`knobStyleOf`), where every token re-derives from them. The site's own
 * look, on `:root`, is never touched.
 */
import { Option, Schema, Struct } from 'effect'
import { Theme, VAR_PREFIX } from 'foldkit-mixins/theme'

/** `system` follows the reader's color scheme. */
export const Scheme = Schema.Literals(['system', 'light', 'dark'])
export type Scheme = typeof Scheme.Type

export const Font = Schema.Literals([
  'system',
  'geist',
  'roboto',
  'serif',
  'mono',
  'rounded',
  'classic',
])
export type Font = typeof Font.Type

/** The neutrals' hue: the accent's, or one of shadcn's base colors. */
export const Base = Schema.Literals([
  'accent',
  'neutral',
  'stone',
  'zinc',
  'mauve',
  'olive',
  'mist',
  'taupe',
])
export type Base = typeof Base.Type

export const MenuAccent = Schema.Literals(['subtle', 'bold'])
export const MenuColor = Schema.Literals([
  'default',
  'inverted',
  'translucent',
  'inverted-translucent',
])
/** What a hover is mixed from, as `Theme.oklch`'s `stateHue`. */
export const Hover = Schema.Literals(['surface', 'neutral', 'accent'])
/** How a transition moves: eased, or on the spring. Not at all is the motion knob at 0. */
export const Easing = Schema.Literals(['ease', 'spring'])
/** A heading's font: the body's (`inherit`), or one of its own. */
export const HeadingFont = Schema.Literals(['inherit', ...Font.literals])
export const Direction = Schema.Literals(['ltr', 'rtl'])
/** The size ladder's step: 36px controls, or Fluid Functionalism's compact 28px. */
export const Size = Schema.Literals(['default', 'compact'])
/** Shadows that diffuse, or solid offset copies (`Theme.hardShadows`). */
export const ShadowStyle = Schema.Literals(['soft', 'hard'])
/** How buttons stand off the page and fields sink into it: flat, or one of `Theme.relief`. */
export const Relief = Schema.Literals(['flat', 'soft', 'hard', 'bevel'])
/** A pressable control's corner: the radius's, or a pill (`control-round`). */
export const ControlShape = Schema.Literals(['rounded', 'pill'])
/** How much the outlines show: the palette's, darker, or drawn in the ink of the text. */
export const Outlines = Schema.Literals(['soft', 'strong', 'ink'])

/** What `/create` adjusts; every field is one knob of the palette or the scales. */
export const Knobs = Schema.Struct({
  hue: Schema.Number,
  chroma: Schema.Number,
  /** The accent's lightness in a light scheme, as a percentage. */
  lightness: Schema.Number,
  surfaceSaturation: Schema.Number,
  /** How far apart the surface steps are, as a percentage. */
  surfaceContrast: Schema.Number,
  /** The page's lightness in a light scheme, then in a dark one, as percentages. */
  surfaceLightness: Schema.Number,
  surfaceLightnessDark: Schema.Number,
  outlines: Outlines,
  radius: Schema.Number,
  density: Schema.Number,
  /** The thinnest border, in pixels; the thicker two keep their steps above it. */
  border: Schema.Number,
  size: Size,
  controlShape: ControlShape,
  motion: Schema.Number,
  /** As a percentage. */
  shadow: Schema.Number,
  shadowStyle: ShadowStyle,
  relief: Relief,
  font: Font,
  base: Base,
  hover: Hover,
  menuAccent: MenuAccent,
  menuColor: MenuColor,
  easing: Easing,
  headingFont: HeadingFont,
  /** Multipliers: every type size, how far headings stand above the body, the line height. */
  textScale: Schema.Number,
  headingScale: Schema.Number,
  leading: Schema.Number,
  headingWeight: Schema.Number,
  /** A heading's letter spacing, in em. */
  tracking: Schema.Number,
  /** The color scales' vividness, as a share of each step's own chroma. */
  scaleChroma: Schema.Number,
  /** Not the theme's: the preview's, to show the components right to left. */
  direction: Direction,
})
export type Knobs = typeof Knobs.Type

/** The numeric knobs, each a slider. */
export const Knob = Schema.Literals([
  'hue',
  'chroma',
  'lightness',
  'surfaceSaturation',
  'surfaceContrast',
  'surfaceLightness',
  'surfaceLightnessDark',
  'radius',
  'density',
  'border',
  'motion',
  'shadow',
  'textScale',
  'headingScale',
  'leading',
  'headingWeight',
  'tracking',
  'scaleChroma',
])
export type Knob = typeof Knob.Type

/** The panes `/create` groups its knobs into. */
export const Section = Schema.Literals(['theme', 'color', 'shape', 'type', 'motion'])
export type Section = typeof Section.Type

export const sectionLabels: Readonly<Record<Section, string>> = {
  theme: 'Themes',
  color: 'Color',
  shape: 'Shape',
  type: 'Type',
  motion: 'Motion',
}

/** A slider's range and step, and how its value reads. */
export interface Range {
  readonly knob: Knob
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit: string
}

const range = (
  knob: Knob,
  label: string,
  [min, max, step]: readonly [number, number, number],
  unit: string,
): Range => ({ knob, label, min, max, step, unit })

export const ranges: ReadonlyArray<Range> = [
  range('hue', 'Hue', [0, 360, 1], '°'),
  range('chroma', 'Chroma', [0, 0.3, 0.005], ''),
  range('lightness', 'Lightness', [15, 90, 1], '%'),
  range('surfaceSaturation', 'Surface tint', [0, 0.04, 0.001], ''),
  range('surfaceLightness', 'Page lightness', [75, 100, 0.5], '%'),
  range('surfaceLightnessDark', 'Page lightness, dark', [6, 36, 0.5], '%'),
  range('surfaceContrast', 'Surface contrast', [0, 100, 1], '%'),
  range('radius', 'Radius', [0, 2.5, 0.05], '×'),
  range('density', 'Density', [0.75, 1.3, 0.05], '×'),
  range('border', 'Border', [1, 3, 1], 'px'),
  range('shadow', 'Shadow', [0, 100, 1], '%'),
  range('motion', 'Motion', [0, 2, 0.1], '×'),
  range('textScale', 'Text size', [0.8, 1.3, 0.025], '×'),
  range('headingScale', 'Heading scale', [0.4, 1.8, 0.05], '×'),
  range('leading', 'Line height', [0.85, 1.3, 0.05], '×'),
  range('headingWeight', 'Heading weight', [300, 900, 100], ''),
  range('tracking', 'Heading tracking', [-0.05, 0.05, 0.005], 'em'),
  range('scaleChroma', 'Scale vividness', [0, 1.5, 0.05], '×'),
]

export const rangeOf = (knob: Knob): Range => ranges.find(each => each.knob === knob)!

/** A value a slider can show: clamped to its range and rounded to its step, without float noise. */
export const fit = (range: Range, value: number): number => {
  const clamped = Math.min(range.max, Math.max(range.min, value))
  const stepped = range.min + Math.round((clamped - range.min) / range.step) * range.step
  return Number(stepped.toFixed(4))
}

const fonts: Readonly<Record<Font, string>> = {
  system: 'system-ui, sans-serif',
  geist: '"Geist", ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: '"Geist Mono", ui-monospace, monospace',
  roboto: 'Roboto, "Segoe UI", system-ui, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif',
  classic: '"MS Sans Serif", "Microsoft Sans Serif", Tahoma, Verdana, sans-serif',
}

/**
 * shadcn's base colors as a neutral hue and the surfaces' chroma, read from
 * its values (`apps/v4/registry/themes.ts`): the hue of each one's muted
 * surface, and a chroma that tints our surfaces about as much.
 */
export const bases: Readonly<
  Record<Exclude<Base, 'accent'>, { readonly h: number; readonly c: number }>
> = {
  neutral: { h: 0, c: 0 },
  stone: { h: 75, c: 0.004 },
  zinc: { h: 286, c: 0.004 },
  mauve: { h: 325, c: 0.007 },
  olive: { h: 106, c: 0.009 },
  mist: { h: 205, c: 0.006 },
  taupe: { h: 25, c: 0.006 },
}

export const fontLabels: Readonly<Record<Font, string>> = {
  system: 'System',
  geist: 'Geist',
  roboto: 'Roboto',
  serif: 'Serif',
  mono: 'Mono',
  rounded: 'Rounded',
  classic: 'Classic',
}

/** `Theme.oklch`'s own page lightness, which the code leaves unsaid. */
const SURFACE_LIGHTNESS = 97.5
const SURFACE_LIGHTNESS_DARK = 22
/** The shipped heading weight and tracking, which the code leaves unsaid. */
const HEADING_WEIGHT = 600
const TRACKING = -0.01

export const defaults: Knobs = {
  hue: 264,
  chroma: 0.17,
  lightness: 52,
  surfaceSaturation: 0.006,
  surfaceContrast: 24,
  surfaceLightness: SURFACE_LIGHTNESS,
  surfaceLightnessDark: SURFACE_LIGHTNESS_DARK,
  outlines: 'soft',
  radius: 1.4,
  density: 1,
  border: 1,
  size: 'default',
  controlShape: 'rounded',
  motion: 1,
  shadow: 100,
  shadowStyle: 'soft',
  relief: 'flat',
  font: 'geist',
  base: 'accent',
  hover: 'surface',
  menuAccent: 'subtle',
  menuColor: 'default',
  easing: 'ease',
  headingFont: 'inherit',
  textScale: 1,
  headingScale: 1,
  leading: 1,
  headingWeight: HEADING_WEIGHT,
  tracking: TRACKING,
  scaleChroma: 1,
  direction: 'ltr',
}

export const sameKnobs = Schema.toEquivalence(Knobs)

/** A style, as shadcn's: the shape knobs it moves, the colors left as they are. */
export interface Look {
  readonly name: string
  readonly description: string
  readonly shape: Pick<
    Knobs,
    'radius' | 'density' | 'size' | 'shadow' | 'surfaceContrast' | 'font' | 'headingFont'
  >
}

export const looks: ReadonlyArray<Look> = [
  {
    name: 'Vega',
    description: 'Clean, neutral, familiar',
    shape: {
      radius: 1,
      density: 1,
      size: 'default',
      shadow: 100,
      surfaceContrast: 24,
      font: 'geist',
      headingFont: 'inherit',
    },
  },
  {
    name: 'Nova',
    description: 'Less padding and margin',
    shape: {
      radius: 1,
      density: 0.85,
      size: 'default',
      shadow: 80,
      surfaceContrast: 24,
      font: 'geist',
      headingFont: 'inherit',
    },
  },
  {
    name: 'Maia',
    description: 'Rounded, with room',
    shape: {
      radius: 2.2,
      density: 1.15,
      size: 'default',
      shadow: 100,
      surfaceContrast: 22,
      font: 'system',
      headingFont: 'inherit',
    },
  },
  {
    name: 'Lyra',
    description: 'Boxy and sharp, for mono',
    shape: {
      radius: 0,
      density: 0.95,
      size: 'default',
      shadow: 0,
      surfaceContrast: 28,
      font: 'mono',
      headingFont: 'inherit',
    },
  },
  {
    name: 'Mira',
    description: 'For compact interfaces',
    shape: {
      radius: 0.8,
      density: 1,
      size: 'compact',
      shadow: 60,
      surfaceContrast: 24,
      font: 'geist',
      headingFont: 'inherit',
    },
  },
  {
    name: 'Luma',
    description: 'Soft and luminous',
    shape: {
      radius: 1.8,
      density: 1.05,
      size: 'default',
      shadow: 50,
      surfaceContrast: 14,
      font: 'system',
      headingFont: 'inherit',
    },
  },
  {
    name: 'Sera',
    description: 'Editorial and typographic',
    shape: {
      radius: 0.5,
      density: 1.05,
      size: 'default',
      shadow: 40,
      surfaceContrast: 20,
      font: 'system',
      headingFont: 'serif',
    },
  },
]

/** Whether `knobs` are in `look`'s shape. */
export const inLook = (knobs: Knobs, look: Look): boolean =>
  Struct.keys(look.shape).every(knob => knobs[knob] === look.shape[knob])

/**
 * A whole theme: every knob but the preview's direction, and the scheme it
 * is known in, which choosing it shows (Nord's polar night, a terminal's
 * black); a preset without one leaves the reader's.
 */
export interface Preset {
  readonly name: string
  readonly description: string
  readonly knobs: Omit<Knobs, 'direction'>
  readonly scheme?: Exclude<Scheme, 'system'>
}

const { direction: _, ...iris } = defaults

export const presets: ReadonlyArray<Preset> = [
  { name: 'Iris', description: 'The default: violet-blue on a cool page', knobs: iris },
  {
    name: 'shadcn',
    description: 'Zinc neutrals, a near-black primary and tight headings, after shadcn/ui',
    scheme: 'light',
    knobs: {
      ...iris,
      hue: 286,
      chroma: 0,
      lightness: 21,
      base: 'zinc',
      surfaceSaturation: 0.004,
      surfaceLightness: 100,
      surfaceLightnessDark: 16,
      surfaceContrast: 22,
      radius: 1.35,
      shadow: 60,
      relief: 'soft',
      hover: 'neutral',
      tracking: -0.025,
    },
  },
  {
    name: 'Material',
    description: 'Tonal surfaces, pill buttons, regular-weight Roboto headings, after Material 3',
    scheme: 'light',
    knobs: {
      ...iris,
      hue: 293,
      chroma: 0.13,
      lightness: 44,
      surfaceSaturation: 0.02,
      surfaceContrast: 18,
      surfaceLightness: 98.5,
      surfaceLightnessDark: 18,
      radius: 1.6,
      density: 1.1,
      controlShape: 'pill',
      shadow: 70,
      relief: 'soft',
      font: 'roboto',
      headingWeight: 400,
      tracking: 0,
      headingScale: 1.15,
      hover: 'accent',
      easing: 'spring',
    },
  },
  {
    name: 'Windows 95',
    description: 'Silver grey, navy, beveled controls, dark frames and square corners',
    scheme: 'light',
    knobs: {
      ...iris,
      hue: 264,
      chroma: 0.19,
      lightness: 30,
      base: 'neutral',
      surfaceSaturation: 0,
      surfaceContrast: 44,
      surfaceLightness: 80,
      outlines: 'ink',
      radius: 0,
      density: 0.9,
      size: 'compact',
      shadow: 100,
      shadowStyle: 'hard',
      relief: 'bevel',
      motion: 0,
      font: 'classic',
      textScale: 0.9,
      headingScale: 0.7,
      headingWeight: 700,
      tracking: 0,
      hover: 'neutral',
    },
  },
  {
    name: 'Brutalist',
    description: 'Black lines, hard shadows, heavy tight headings and a loud yellow',
    scheme: 'light',
    knobs: {
      ...iris,
      hue: 100,
      chroma: 0.19,
      lightness: 88,
      base: 'neutral',
      surfaceSaturation: 0,
      surfaceContrast: 34,
      surfaceLightness: 98,
      outlines: 'ink',
      radius: 0.3,
      border: 2,
      shadow: 100,
      shadowStyle: 'hard',
      relief: 'hard',
      headingScale: 1.3,
      headingWeight: 800,
      tracking: -0.03,
      hover: 'neutral',
    },
  },
  {
    name: 'Solarized',
    description: 'Base3 cream, blue, and type set in mono, after Ethan Schoonover’s palette',
    scheme: 'light',
    knobs: {
      ...iris,
      hue: 245,
      chroma: 0.14,
      lightness: 60,
      base: 'stone',
      surfaceSaturation: 0.03,
      surfaceLightness: 96.5,
      surfaceLightnessDark: 27,
      radius: 0.6,
      shadow: 30,
      font: 'mono',
      headingWeight: 700,
      tracking: 0,
      headingScale: 0.85,
    },
  },
  {
    name: 'Nord',
    description: 'Frost blue on the polar night, after Nord',
    scheme: 'dark',
    knobs: {
      ...iris,
      hue: 213,
      chroma: 0.07,
      lightness: 62,
      surfaceSaturation: 0.018,
      surfaceContrast: 22,
      surfaceLightness: 95.5,
      surfaceLightnessDark: 32,
      radius: 1,
      shadow: 50,
      font: 'system',
      headingWeight: 500,
      hover: 'neutral',
    },
  },
  {
    name: 'Ocean',
    description: 'A deep blue on blue-tinted surfaces',
    knobs: { ...iris, hue: 232, chroma: 0.14, lightness: 50, surfaceSaturation: 0.014 },
  },
  {
    name: 'Forest',
    description: 'Leaf green, a little squarer',
    knobs: { ...iris, hue: 152, chroma: 0.12, lightness: 48, radius: 0.8 },
  },
  {
    name: 'Ember',
    description: 'Warm orange, tighter',
    knobs: { ...iris, hue: 38, chroma: 0.17, lightness: 60, radius: 0.6, density: 0.9 },
  },
  {
    name: 'Orchid',
    description: 'Pink, round and serif',
    knobs: {
      ...iris,
      hue: 328,
      chroma: 0.16,
      lightness: 56,
      radius: 2.2,
      surfaceSaturation: 0.02,
      font: 'serif',
      headingWeight: 500,
      tracking: 0,
    },
  },
  {
    name: 'Terminal',
    description: 'Phosphor green in mono on black: sharp, still, and barely any heading scale',
    scheme: 'dark',
    knobs: {
      ...iris,
      hue: 145,
      chroma: 0.2,
      lightness: 55,
      surfaceSaturation: 0.012,
      surfaceLightnessDark: 12,
      outlines: 'strong',
      radius: 0,
      shadow: 0,
      motion: 0,
      font: 'mono',
      headingScale: 0.5,
      headingWeight: 700,
      tracking: 0,
      hover: 'accent',
    },
  },
]

/** `preset`'s knobs, drawn in the direction the preview already reads. */
export const presetKnobs = (preset: Preset, direction: Knobs['direction']): Knobs => ({
  ...preset.knobs,
  direction,
})

/**
 * Knobs drawn at random, for a theme to start from: every choice, and each
 * slider within the part of its range that keeps text readable.
 */
export const shuffled = (random: () => number, direction: Knobs['direction']): Knobs => {
  const pick = <A>(values: ReadonlyArray<A>): A =>
    values[Math.min(values.length - 1, Math.floor(random() * values.length))]!
  const between = (knob: Knob, low: number, high: number) =>
    fit(rangeOf(knob), low + random() * (high - low))
  const across = (knob: Knob) => between(knob, rangeOf(knob).min, rangeOf(knob).max)
  // A base color brings its own tint, as choosing one does: Neutral is grey.
  const base = pick(Base.literals)
  return {
    hue: across('hue'),
    chroma: between('chroma', 0.06, 0.24),
    lightness: between('lightness', 40, 65),
    surfaceSaturation: base === 'accent' ? across('surfaceSaturation') : bases[base].c,
    surfaceContrast: between('surfaceContrast', 10, 40),
    surfaceLightness: between('surfaceLightness', 94, 100),
    surfaceLightnessDark: between('surfaceLightnessDark', 14, 28),
    outlines: pick(['soft', 'soft', 'strong'] as const),
    radius: across('radius'),
    density: across('density'),
    border: pick([1, 1, 1, 2]),
    size: pick(Size.literals),
    controlShape: pick(ControlShape.literals),
    motion: 1,
    shadow: across('shadow'),
    shadowStyle: pick(['soft', 'soft', 'soft', 'hard'] as const),
    // Mostly flat or soft: a bevel or a hard edge on every other shuffle reads as noise.
    relief: pick(['flat', 'flat', 'soft', 'soft', 'hard', 'bevel'] as const),
    font: pick(Font.literals),
    base,
    hover: pick(Hover.literals),
    menuAccent: pick(MenuAccent.literals),
    menuColor: pick(MenuColor.literals),
    easing: pick(Easing.literals),
    headingFont: pick(HeadingFont.literals),
    textScale: between('textScale', 0.9, 1.15),
    headingScale: between('headingScale', 0.7, 1.4),
    leading: between('leading', 0.95, 1.15),
    headingWeight: pick([400, 500, 600, 700, 800]),
    tracking: between('tracking', -0.03, 0.01),
    scaleChroma: between('scaleChroma', 0.7, 1.2),
    direction,
  }
}

const percent = (value: number) => `${value}%`

const surfacesOf = (knobs: Knobs) =>
  Theme.oklch({
    accent: { h: knobs.hue, c: knobs.chroma, l: percent(knobs.lightness) },
    ...(knobs.base === 'accent' ? {} : { neutral: { h: bases[knobs.base].h } }),
    surfaceSaturation: knobs.surfaceSaturation,
    surfaceContrast: percent(knobs.surfaceContrast),
    menu: { accent: knobs.menuAccent, color: knobs.menuColor },
    stateHue: knobs.hover,
  })

/** The shipped borders' 1, 2 and 3px, moved up together. */
const bordersOf = (knobs: Knobs) => ({
  thin: `${knobs.border}px`,
  thick: `${knobs.border + 1}px`,
  heavy: `${knobs.border + 2}px`,
})

const headingOf = (knobs: Knobs) =>
  knobs.headingFont === 'inherit' ? 'inherit' : fonts[knobs.headingFont]

/** On the spring, every recipe's eased transition springs: the token reads the shipped curve. */
const easeOf = (knobs: Knobs) =>
  knobs.easing === 'spring' ? `var(${VAR_PREFIX}-motion-spring)` : 'ease-out'

/**
 * The outlines drawn in the text's ink, at three strengths for subtle,
 * default and overt, over any surface: `strong` darkens the palette's lines,
 * `ink` draws them nearly black, as Windows 95's frames and a brutalist
 * page's are. The focus ring keeps the accent.
 */
const inks: Readonly<
  Record<Exclude<typeof Outlines.Type, 'soft'>, readonly [number, number, number]>
> = { strong: [22, 48, 72], ink: [45, 88, 100] }
const inked = (percent: number) =>
  `color-mix(in oklch, var(${VAR_PREFIX}-text-overt) ${percent}%, transparent)`
const outlineOf = (knobs: Knobs) => {
  if (knobs.outlines === 'soft') return Option.none()
  const [subtle, line, overt] = inks[knobs.outlines]
  return Option.some({ subtle: inked(subtle), default: inked(line), overt: inked(overt) })
}

/** The type knobs, as the tokens a heading and the scale read. */
const typeOf = (knobs: Knobs) => ({
  weight: { heading: String(knobs.headingWeight) },
  tracking: { heading: `${knobs.tracking}em` },
})

/** The shadow scale and the controls' relief `knobs` ask for, over the shipped ones. */
const shadowsOf = (knobs: Knobs) => {
  const scale = knobs.shadowStyle === 'hard' ? Theme.hardShadows : Theme.define({})
  return knobs.relief === 'flat' ? scale : Theme.compose(scale, Theme.relief[knobs.relief])
}

/** The palette `knobs` describe, as an application writes it (`codeOf`). */
export const paletteOf = (knobs: Knobs) =>
  Theme.compose(
    Theme.compose(shadowsOf(knobs), surfacesOf(knobs)),
    Theme.define({
      knob: {
        'radius-factor': String(knobs.radius),
        density: String(knobs.density),
        step: knobs.size === 'compact' ? '1' : '0',
        motion: String(knobs.motion),
        'shadow-strength': percent(knobs.shadow),
        'base-l': percent(knobs.surfaceLightness),
        'base-l-dark': percent(knobs.surfaceLightnessDark),
        'text-scale': String(knobs.textScale),
        'heading-scale': String(knobs.headingScale),
        leading: String(knobs.leading),
        'control-round': knobs.controlShape === 'pill' ? '1' : '0',
        'scale-c': String(knobs.scaleChroma),
      },
      font: { body: fonts[knobs.font], heading: headingOf(knobs) },
      motion: { ease: easeOf(knobs) },
      border: bordersOf(knobs),
      ...typeOf(knobs),
      ...Option.match(outlineOf(knobs), { onNone: () => ({}), onSome: outline => ({ outline }) }),
    }),
  )

/** The whole theme a preview declares: the shipped scales with the palette over them. */
export const themeOf = (knobs: Knobs) => Theme.compose(Theme.tokens, paletteOf(knobs))

const declarationsOf = (
  theme: Readonly<Record<string, Readonly<Record<string, string>>>>,
  groups?: ReadonlySet<string>,
  /** Leave out each token that already has this value here. */
  unlike?: Readonly<Record<`--${string}`, string>>,
): Record<`--${string}`, string> => {
  const declared: Record<`--${string}`, string> = {}
  for (const [group, names] of Object.entries(theme)) {
    if (groups !== undefined && !groups.has(group)) continue
    for (const [name, value] of Object.entries(names)) {
      const property = `${VAR_PREFIX}-${group}-${name}` as const
      if (unlike?.[property] !== value) declared[property] = value
    }
  }
  return declared
}

/** Every token of the default theme, for a preview's own rule. */
export const declared = declarationsOf(themeOf(defaults))

/**
 * The groups `knobs` reach. Every other token is an expression over these, so
 * overriding them on the element that declares the rest re-derives the theme.
 * `state` is among them for its `ink`, which `stateHue` writes outright.
 */
export const KNOB_GROUPS: ReadonlySet<string> = new Set([
  'knob',
  'font',
  'motion',
  'border',
  'shadow',
  'state',
  'weight',
  'tracking',
  'outline',
])

/** The last overrides made: every preview on a page asks for the same ones, render after render. */
let last:
  | { readonly knobs: Knobs; readonly scheme: Scheme; readonly style: Record<string, string> }
  | undefined

/**
 * The inline overrides that turn the default preview into `knobs`: only the
 * tokens that differ from what the preview's rule declares, since every
 * preview on a page carries them (the gallery draws dozens).
 */
export const knobStyleOf = (knobs: Knobs, scheme: Scheme): Record<string, string> => {
  if (last !== undefined && last.knobs === knobs && last.scheme === scheme) return last.style
  const style = {
    ...declarationsOf(themeOf(knobs), KNOB_GROUPS, declared),
    colorScheme: scheme === 'system' ? 'light dark' : scheme,
  }
  last = { knobs, scheme, style }
  return style
}

const indent = (text: string, by: string) =>
  text
    .split('\n')
    .map(line => (line === '' ? line : `${by}${line}`))
    .join('\n')

/** The palette `knobs` describe, as source an application pastes into its style module. */
export const codeOf = (knobs: Knobs): string => {
  const surfaces = [
    'Theme.oklch({',
    `  accent: { h: ${knobs.hue}, c: ${knobs.chroma}, l: '${percent(knobs.lightness)}' },`,
    `  surfaceSaturation: ${knobs.surfaceSaturation},`,
    ...(knobs.base === 'accent' ? [] : [`  neutral: { h: ${bases[knobs.base].h} },`]),
    `  surfaceContrast: '${percent(knobs.surfaceContrast)}',`,
    ...(knobs.menuAccent === 'subtle' && knobs.menuColor === 'default'
      ? []
      : [`  menu: { accent: '${knobs.menuAccent}', color: '${knobs.menuColor}' },`]),
    ...(knobs.hover === 'surface' ? [] : [`  stateHue: '${knobs.hover}',`]),
    '}),',
  ].join('\n')
  const borders = bordersOf(knobs)
  // Each token set over the surfaces, one compose apiece: compose takes two.
  const over = [
    ...(knobs.shadowStyle === 'hard' ? ['Theme.hardShadows,'] : []),
    ...(knobs.relief === 'flat' ? [] : [`Theme.relief.${knobs.relief},`]),
  ]
  const palette = [
    over.reduceRight(
      (inner, set) => ['Theme.compose(', `  ${set}`, indent(inner, '  '), '),'].join('\n'),
      surfaces,
    ),
    'Theme.define({',
    '  knob: {',
    `    'radius-factor': '${knobs.radius}',`,
    `    density: '${knobs.density}',`,
    ...(knobs.size === 'compact' ? ["    step: '1',"] : []),
    `    motion: '${knobs.motion}',`,
    `    'shadow-strength': '${percent(knobs.shadow)}',`,
    ...(knobs.surfaceLightness === SURFACE_LIGHTNESS
      ? []
      : [`    'base-l': '${percent(knobs.surfaceLightness)}',`]),
    ...(knobs.surfaceLightnessDark === SURFACE_LIGHTNESS_DARK
      ? []
      : [`    'base-l-dark': '${percent(knobs.surfaceLightnessDark)}',`]),
    ...(knobs.textScale === 1 ? [] : [`    'text-scale': '${knobs.textScale}',`]),
    ...(knobs.headingScale === 1 ? [] : [`    'heading-scale': '${knobs.headingScale}',`]),
    ...(knobs.leading === 1 ? [] : [`    leading: '${knobs.leading}',`]),
    ...(knobs.controlShape === 'pill' ? ["    'control-round': '1',"] : []),
    ...(knobs.scaleChroma === 1 ? [] : [`    'scale-c': '${knobs.scaleChroma}',`]),
    '  },',
    `  font: { body: '${fonts[knobs.font]}', heading: '${headingOf(knobs)}' },`,
    ...(knobs.easing === 'spring' ? ["  motion: { ease: 'var(--fk-motion-spring)' },"] : []),
    ...(knobs.border === 1
      ? []
      : [
          `  border: { thin: '${borders.thin}', thick: '${borders.thick}', heavy: '${borders.heavy}' },`,
        ]),
    ...(knobs.headingWeight === HEADING_WEIGHT
      ? []
      : [`  weight: { heading: '${knobs.headingWeight}' },`]),
    ...(knobs.tracking === TRACKING ? [] : [`  tracking: { heading: '${knobs.tracking}em' },`]),
    ...Option.match(outlineOf(knobs), {
      onNone: () => [],
      onSome: outline => [
        `  outline: { subtle: '${outline.subtle}', default: '${outline.default}', overt: '${outline.overt}' },`,
      ],
    }),
    '}),',
  ].join('\n')
  return [
    "import { AppStyle } from 'foldkit-mixins/app'",
    "import { Theme } from 'foldkit-mixins/theme'",
    '',
    'export const { t, slots, forSlots, stylesheet } = AppStyle.make({',
    '  palette: Theme.compose(',
    indent(palette, '    '),
    '  ),',
    '})',
    '',
  ].join('\n')
}
