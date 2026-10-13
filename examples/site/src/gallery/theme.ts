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
}

export const sameKnobs = (left: Knobs, right: Knobs): boolean =>
  Knob.literals.every(knob => left[knob] === right[knob]) && left.font === right.font

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
      surfaceSaturation: knobs.surfaceSaturation,
      surfaceContrast: percent(knobs.surfaceContrast),
    }),
    Theme.define({
      knob: {
        'radius-factor': String(knobs.radius),
        density: String(knobs.density),
        motion: String(knobs.motion),
        'shadow-strength': percent(knobs.shadow),
      },
      font: { body: fonts[knobs.font], heading: 'inherit' },
    }),
  )

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
const KNOB_GROUPS: ReadonlySet<string> = new Set(['knob', 'font'])

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
    `  surfaceContrast: '${percent(knobs.surfaceContrast)}',`,
    '}),',
    'Theme.define({',
    '  knob: {',
    `    'radius-factor': '${knobs.radius}',`,
    `    density: '${knobs.density}',`,
    `    motion: '${knobs.motion}',`,
    `    'shadow-strength': '${percent(knobs.shadow)}',`,
    '  },',
    `  font: { body: '${fonts[knobs.font]}', heading: 'inherit' },`,
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
