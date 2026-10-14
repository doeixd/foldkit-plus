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
import { Schema } from 'effect'
import { Theme, VAR_PREFIX } from 'foldkit-mixins/theme'

/** `system` follows the reader's color scheme. */
export const Scheme = Schema.Literals(['system', 'light', 'dark'])
export type Scheme = typeof Scheme.Type

export const Font = Schema.Literals(['system', 'geist', 'serif', 'mono'])
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
/** How a transition moves: eased, or on the spring. Not at all is the motion knob at 0. */
export const Easing = Schema.Literals(['ease', 'spring'])
export const HeadingFont = Schema.Literals(['inherit', 'system', 'geist', 'serif', 'mono'])
export const Direction = Schema.Literals(['ltr', 'rtl'])

/** What `/create` adjusts; every field is one knob of the palette or the scales. */
export const Knobs = Schema.Struct({
  hue: Schema.Number,
  chroma: Schema.Number,
  /** The accent's lightness in a light scheme, as a percentage. */
  lightness: Schema.Number,
  surfaceSaturation: Schema.Number,
  /** How far apart the surface steps are, as a percentage. */
  surfaceContrast: Schema.Number,
  radius: Schema.Number,
  density: Schema.Number,
  motion: Schema.Number,
  /** As a percentage. */
  shadow: Schema.Number,
  font: Font,
  base: Base,
  menuAccent: MenuAccent,
  menuColor: MenuColor,
  easing: Easing,
  headingFont: HeadingFont,
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
  'radius',
  'density',
  'motion',
  'shadow',
])
export type Knob = typeof Knob.Type

/** A slider's range and step, and how its value reads. */
export interface Range {
  readonly knob: Knob
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit: string
}

export const ranges: ReadonlyArray<Range> = [
  { knob: 'hue', label: 'Hue', min: 0, max: 360, step: 1, unit: '°' },
  { knob: 'chroma', label: 'Chroma', min: 0, max: 0.3, step: 0.005, unit: '' },
  { knob: 'lightness', label: 'Lightness', min: 25, max: 75, step: 1, unit: '%' },
  { knob: 'surfaceSaturation', label: 'Surface tint', min: 0, max: 0.04, step: 0.001, unit: '' },
  { knob: 'surfaceContrast', label: 'Surface contrast', min: 0, max: 100, step: 1, unit: '%' },
  { knob: 'radius', label: 'Radius', min: 0, max: 2.5, step: 0.05, unit: '×' },
  { knob: 'density', label: 'Density', min: 0.75, max: 1.3, step: 0.05, unit: '×' },
  { knob: 'motion', label: 'Motion', min: 0, max: 2, step: 0.1, unit: '×' },
  { knob: 'shadow', label: 'Shadow', min: 0, max: 100, step: 1, unit: '%' },
]

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
  serif: 'Serif',
  mono: 'Mono',
}

export const defaults: Knobs = {
  hue: 264,
  chroma: 0.17,
  lightness: 52,
  surfaceSaturation: 0.006,
  surfaceContrast: 60,
  radius: 1.4,
  density: 1,
  motion: 1,
  shadow: 100,
  font: 'geist',
  base: 'accent',
  menuAccent: 'subtle',
  menuColor: 'default',
  easing: 'ease',
  headingFont: 'inherit',
  direction: 'ltr',
}

const choiceKnobs = [
  'font',
  'base',
  'menuAccent',
  'menuColor',
  'easing',
  'headingFont',
  'direction',
] as const

export const sameKnobs = (left: Knobs, right: Knobs): boolean =>
  Knob.literals.every(knob => left[knob] === right[knob]) &&
  choiceKnobs.every(knob => left[knob] === right[knob])

/** A style, as shadcn's: the shape knobs it moves, the colors left as they are. */
export interface Look {
  readonly name: string
  readonly description: string
  readonly shape: Pick<
    Knobs,
    'radius' | 'density' | 'shadow' | 'surfaceContrast' | 'font' | 'headingFont'
  >
}

export const looks: ReadonlyArray<Look> = [
  {
    name: 'Vega',
    description: 'Clean, neutral, familiar',
    shape: {
      radius: 1,
      density: 1,
      shadow: 100,
      surfaceContrast: 60,
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
      shadow: 80,
      surfaceContrast: 60,
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
      shadow: 100,
      surfaceContrast: 55,
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
      shadow: 0,
      surfaceContrast: 70,
      font: 'mono',
      headingFont: 'inherit',
    },
  },
  {
    name: 'Mira',
    description: 'For compact interfaces',
    shape: {
      radius: 0.8,
      density: 0.8,
      shadow: 60,
      surfaceContrast: 60,
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
      shadow: 50,
      surfaceContrast: 35,
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
      shadow: 40,
      surfaceContrast: 50,
      font: 'system',
      headingFont: 'serif',
    },
  },
]

/** Whether `knobs` are in `look`'s shape. */
export const inLook = (knobs: Knobs, look: Look): boolean =>
  (Object.keys(look.shape) as ReadonlyArray<keyof Look['shape']>).every(
    knob => knobs[knob] === look.shape[knob],
  )

export interface Preset {
  readonly name: string
  readonly knobs: Knobs
}

export const presets: ReadonlyArray<Preset> = [
  { name: 'Iris', knobs: defaults },
  {
    name: 'Zinc',
    knobs: { ...defaults, hue: 286, chroma: 0, lightness: 21, surfaceSaturation: 0.002 },
  },
  {
    name: 'Ocean',
    knobs: { ...defaults, hue: 232, chroma: 0.14, lightness: 50, surfaceSaturation: 0.014 },
  },
  {
    name: 'Forest',
    knobs: { ...defaults, hue: 152, chroma: 0.12, lightness: 48, radius: 0.8 },
  },
  {
    name: 'Ember',
    knobs: { ...defaults, hue: 38, chroma: 0.17, lightness: 60, radius: 0.6, density: 0.9 },
  },
  {
    name: 'Orchid',
    knobs: {
      ...defaults,
      hue: 328,
      chroma: 0.16,
      lightness: 56,
      radius: 2.2,
      surfaceSaturation: 0.02,
      font: 'serif',
    },
  },
  {
    name: 'Terminal',
    knobs: {
      ...defaults,
      hue: 145,
      chroma: 0.2,
      lightness: 55,
      radius: 0,
      shadow: 0,
      motion: 0,
      font: 'mono',
    },
  },
]

const percent = (value: number) => `${value}%`

/** The palette `knobs` describe, as an application writes it (`codeOf`). */
export const paletteOf = (knobs: Knobs) =>
  Theme.compose(
    Theme.oklch({
      accent: { h: knobs.hue, c: knobs.chroma, l: percent(knobs.lightness) },
      ...(knobs.base === 'accent' ? {} : { neutral: { h: bases[knobs.base].h } }),
      surfaceSaturation: knobs.surfaceSaturation,
      surfaceContrast: percent(knobs.surfaceContrast),
      menu: { accent: knobs.menuAccent, color: knobs.menuColor },
    }),
    Theme.define({
      knob: {
        'radius-factor': String(knobs.radius),
        density: String(knobs.density),
        motion: String(knobs.motion),
        'shadow-strength': percent(knobs.shadow),
      },
      font: { body: fonts[knobs.font], heading: headingOf(knobs) },
      motion: { ease: easeOf(knobs) },
    }),
  )

const headingOf = (knobs: Knobs) =>
  knobs.headingFont === 'inherit' ? 'inherit' : fonts[knobs.headingFont]

/** On the spring, every recipe's eased transition springs: the token reads the shipped curve. */
const easeOf = (knobs: Knobs) =>
  knobs.easing === 'spring' ? `var(${VAR_PREFIX}-motion-spring)` : 'ease-out'

/** The whole theme a preview declares: the shipped scales with the palette over them. */
export const themeOf = (knobs: Knobs) => Theme.compose(Theme.tokens, paletteOf(knobs))

const declarationsOf = (
  theme: Readonly<Record<string, Readonly<Record<string, string>>>>,
  groups?: ReadonlySet<string>,
): Record<`--${string}`, string> => {
  const declared: Record<`--${string}`, string> = {}
  for (const [group, names] of Object.entries(theme)) {
    if (groups !== undefined && !groups.has(group)) continue
    for (const [name, value] of Object.entries(names))
      declared[`${VAR_PREFIX}-${group}-${name}`] = value
  }
  return declared
}

/** Every token of the default theme, for a preview's own rule. */
export const declared = declarationsOf(themeOf(defaults))

/**
 * The groups `knobs` reach. Every other token is an expression over these, so
 * overriding them on the element that declares the rest re-derives the theme.
 */
const KNOB_GROUPS: ReadonlySet<string> = new Set(['knob', 'font', 'motion'])

/** The last overrides made: every preview on a page asks for the same ones, render after render. */
let last:
  | { readonly knobs: Knobs; readonly scheme: Scheme; readonly style: Record<string, string> }
  | undefined

/** The inline overrides that turn the default preview into `knobs`. */
export const knobStyleOf = (knobs: Knobs, scheme: Scheme): Record<string, string> => {
  if (last !== undefined && last.knobs === knobs && last.scheme === scheme) return last.style
  const style = {
    ...declarationsOf(themeOf(knobs), KNOB_GROUPS),
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
  const palette = [
    'Theme.oklch({',
    `  accent: { h: ${knobs.hue}, c: ${knobs.chroma}, l: '${percent(knobs.lightness)}' },`,
    `  surfaceSaturation: ${knobs.surfaceSaturation},`,
    ...(knobs.base === 'accent' ? [] : [`  neutral: { h: ${bases[knobs.base].h} },`]),
    `  surfaceContrast: '${percent(knobs.surfaceContrast)}',`,
    ...(knobs.menuAccent === 'subtle' && knobs.menuColor === 'default'
      ? []
      : [`  menu: { accent: '${knobs.menuAccent}', color: '${knobs.menuColor}' },`]),
    '}),',
    'Theme.define({',
    '  knob: {',
    `    'radius-factor': '${knobs.radius}',`,
    `    density: '${knobs.density}',`,
    `    motion: '${knobs.motion}',`,
    `    'shadow-strength': '${percent(knobs.shadow)}',`,
    '  },',
    `  font: { body: '${fonts[knobs.font]}', heading: '${headingOf(knobs)}' },`,
    ...(knobs.easing === 'spring' ? ["  motion: { ease: 'var(--fk-motion-spring)' },"] : []),
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
