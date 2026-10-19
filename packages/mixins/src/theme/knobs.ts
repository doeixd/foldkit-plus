/**
 * The standard knobs, and a theme as a typed set of their values.
 *
 * `Knobs.standard` is every knob the shipped tokens and palette read, grouped
 * by concern. A theme (`Theme.make`) holds the values it sets and nothing
 * else; `Theme.variables` writes them, every knob it leaves unset holding its
 * default or the expression it follows (`docs/theme-knobs.md`).
 */
import { Option, Schema } from 'effect'
import { pipeSelf, type Pipeable } from '../pipe.js'
import { define } from './core.js'
import * as Knob from './knob.js'

/** Knobs grouped one level deep: `{ shape: { radius: Knob.number(...) } }`. */
export type KnobSet = {
  readonly [group: string]: { readonly [name: string]: Knob.Knob<unknown> }
}

/** The value a theme writes to `K`. */
export type ValueOf<K> = K extends Knob.Knob<infer V> ? V : never

/** Values for some of `S`'s knobs, by group and name. */
export type Values<S extends KnobSet> = {
  readonly [G in keyof S]?: { readonly [N in keyof S[G]]?: ValueOf<S[G][N]> }
}

const hue = (variable: string, value: number, description: string) =>
  Knob.angle({ variable, default: value, min: 0, max: 360, description })
const ref = (group: string, name: string) => `var(--fk-${group}-${name})`

export const standard = {
  accent: {
    hue: Knob.angle({
      variable: 'accent-h',
      default: 264,
      min: 0,
      max: 360,
      description:
        'The accent’s place on the color wheel, in degrees: about 25 is red, 145 green, 264 blue. Buttons, links, focus rings and selections take it.',
    }),
    chroma: Knob.schemed(
      Knob.number({
        variable: 'accent-c',
        default: 0.17,
        min: 0,
        max: 0.4,
        step: 0.005,
        description:
          'How vivid the accent is. 0 is grey; around 0.2 is as vivid as most screens show.',
      }),
      Knob.number({
        variable: 'accent-c-dark',
        default: 0.2,
        // A little stronger on a dark page, where the same chroma reads duller.
        follows: `min(0.4, calc(${ref('knob', 'accent-c')} + 0.03))`,
        min: 0,
        max: 0.4,
        step: 0.005,
        description: 'How vivid the accent is in the dark scheme.',
      }),
    ),
    lightness: Knob.schemed(
      Knob.percent({
        variable: 'accent-l',
        default: 52,
        min: 15,
        max: 90,
        step: 1,
        description: 'How light the accent is in the light scheme.',
      }),
      Knob.percent({
        variable: 'accent-l-dark',
        default: 70,
        min: 15,
        max: 90,
        step: 1,
        description: 'How light the accent is in the dark scheme.',
      }),
    ),
    secondaryShift: Knob.angle({
      variable: 'secondary-shift',
      default: 60,
      description: 'Degrees from the accent’s hue to the secondary family’s.',
    }),
    tertiaryShift: Knob.angle({
      variable: 'tertiary-shift',
      default: -90,
      description: 'Degrees from the accent’s hue to the tertiary family’s.',
    }),
  },
  surface: {
    hue: Knob.angle({
      variable: 'neutral-h',
      default: 264,
      follows: ref('hue', 'accent'),
      min: 0,
      max: 360,
      description:
        'The hue the neutrals are mixed from: the page, text and borders. Unset, the accent’s own.',
    }),
    saturation: Knob.schemed(
      Knob.number({
        variable: 'surface-c',
        default: 0.015,
        min: 0,
        max: 0.04,
        step: 0.001,
        description: 'How much the page, cards and borders lean toward their hue. 0 is pure grey.',
      }),
      Knob.number({
        variable: 'surface-c-dark',
        default: 0.02,
        follows: `calc(${ref('knob', 'surface-c')} * 4 / 3)`,
        min: 0,
        max: 0.04,
        step: 0.001,
        description: 'How much the dark scheme’s surfaces lean toward their hue.',
      }),
    ),
    lightness: Knob.schemed(
      Knob.percent({
        variable: 'base-l',
        default: 97.5,
        min: 75,
        max: 100,
        step: 0.5,
        description:
          'How light the page is in the light scheme. Cards, fields and hovers step from it.',
      }),
      Knob.percent({
        variable: 'base-l-dark',
        default: 22,
        min: 6,
        max: 36,
        step: 0.5,
        description:
          'How light the page is in the dark scheme. Cards, fields and hovers step from it.',
      }),
    ),
    contrast: Knob.percent({
      variable: 'surface-contrast',
      default: 26,
      min: 0,
      max: 100,
      step: 1,
      description:
        'How far apart the surface steps are: the page, a card on it, a field, a hover. Low is flat; high sets each apart.',
    }),
    textContrast: Knob.number({
      variable: 'contrast-factor',
      default: 1,
      min: 0,
      max: 2,
      step: 0.05,
      description: 'Multiplies the text’s chroma.',
    }),
  },
  shape: {
    radius: Knob.number({
      variable: 'radius-factor',
      default: 1,
      min: 0,
      max: 2.5,
      step: 0.05,
      description:
        'Multiplies every corner. 0 is square. A control inside a card keeps inside the card’s corner.',
    }),
    density: Knob.number({
      variable: 'density',
      default: 1,
      min: 0.75,
      max: 1.3,
      step: 0.05,
      description:
        'Multiplies spacing: padding, gaps and margins. Below 1 is tighter, above 1 roomier.',
    }),
    size: Knob.choice({
      default: 'default',
      options: { default: { step: '0' }, compact: { step: '1' } },
      description: 'How tall controls are: 36px, or a compact 28px.',
    }),
    controls: Knob.choice({
      default: 'rounded',
      options: { rounded: { 'control-round': '0' }, pill: { 'control-round': '1' } },
      description: 'The corners of buttons: the radius’s, or fully round pills.',
    }),
  },
  type: {
    scale: Knob.number({
      variable: 'text-scale',
      default: 1,
      min: 0.8,
      max: 1.3,
      step: 0.025,
      description: 'Multiplies every text size, headings and body alike.',
    }),
    headingScale: Knob.number({
      variable: 'heading-scale',
      default: 1,
      min: 0.4,
      max: 1.8,
      step: 0.05,
      description:
        'How far headings stand above body text: below 1 nearer its size, above 1 larger.',
    }),
    leading: Knob.number({
      variable: 'leading',
      default: 1,
      min: 0.85,
      max: 1.3,
      step: 0.05,
      description: 'Multiplies line height, the space each line of text takes.',
    }),
  },
  motion: {
    scale: Knob.number({
      variable: 'motion',
      default: 1,
      min: 0,
      max: 2,
      step: 0.1,
      description: 'Multiplies how long every transition takes. 0 stills them; 2 is twice as slow.',
    }),
  },
  shadow: {
    strength: Knob.percent({
      variable: 'shadow-strength',
      default: 100,
      min: 0,
      max: 100,
      step: 1,
      description: 'How strong shadows are. 0 removes them.',
    }),
    hue: Knob.angle({
      variable: 'shadow-h',
      default: 264,
      follows: ref('hue', 'neutral'),
      min: 0,
      max: 360,
      description: 'The hue every shadow is tinted with. Unset, the neutrals’.',
    }),
    chroma: Knob.number({
      variable: 'shadow-c',
      default: 0.03,
      follows: `calc(${ref('knob', 'surface-c')} * 2)`,
      min: 0,
      max: 0.1,
      step: 0.005,
      description: 'How tinted every shadow is. Unset, twice the surfaces’ saturation.',
    }),
  },
  menu: {
    highlight: Knob.choice({
      default: 'subtle',
      options: { subtle: { 'popup-bold': '0' }, bold: { 'popup-bold': '1' } },
      description:
        'How the highlighted row of a menu shows: a subtle tint, or filled with the accent.',
    }),
    panel: Knob.choice({
      default: 'default',
      options: {
        default: { 'popup-invert': '0', 'popup-alpha': '1', 'popup-blur': '0px' },
        inverted: { 'popup-invert': '1', 'popup-alpha': '1', 'popup-blur': '0px' },
        translucent: { 'popup-invert': '0', 'popup-alpha': '0.8', 'popup-blur': '12px' },
        'inverted-translucent': { 'popup-invert': '1', 'popup-alpha': '0.8', 'popup-blur': '12px' },
      },
      description:
        'The background of menus and popovers: the page’s, inverted (dark on a light page), or translucent, the page blurred behind it.',
    }),
  },
  feedback: {
    success: hue('success-h', 145, 'The hue of success: a saved form, a passing check.'),
    warning: hue('warning-h', 75, 'The hue of a warning.'),
    error: hue('error-h', 25, 'The hue of an error: a refused field, a failed save.'),
    info: hue('info-h', 245, 'The hue of a neutral notice.'),
  },
  code: {
    chroma: Knob.number({
      variable: 'syntax-c',
      default: 0.14,
      min: 0,
      max: 0.4,
      step: 0.01,
      description: 'How vivid code’s colors are.',
    }),
  },
  chart: {
    hue: hue(
      'chart-h',
      255,
      'The first chart series’ hue; the other four keep their places around it.',
    ),
  },
  scales: {
    chroma: Knob.number({
      variable: 'scale-c',
      default: 1,
      min: 0,
      max: 1.5,
      step: 0.05,
      description:
        'How vivid the seven color scales are, as a share of each step’s own. 0 turns them grey.',
    }),
    red: hue('red-h', 25, 'The red scale’s hue.'),
    orange: hue('orange-h', 55, 'The orange scale’s hue.'),
    yellow: hue('yellow-h', 90, 'The yellow scale’s hue.'),
    green: hue('green-h', 145, 'The green scale’s hue.'),
    teal: hue('teal-h', 185, 'The teal scale’s hue.'),
    blue: hue('blue-h', 255, 'The blue scale’s hue.'),
    purple: hue('purple-h', 300, 'The purple scale’s hue.'),
  },
} as const satisfies KnobSet

export type Standard = typeof standard

/** A theme: the knobs it may set, the values it sets, and what it is called in a list. */
export interface KnobTheme<S extends KnobSet = Standard> extends Pipeable<KnobTheme<S>> {
  readonly knobs: S
  readonly values: Values<S>
  readonly title: Option.Option<string>
  readonly description: Option.Option<string>
}

const theme = <S extends KnobSet>(
  knobs: S,
  values: Values<S>,
  title: Option.Option<string>,
  description: Option.Option<string>,
): KnobTheme<S> => ({
  knobs,
  values,
  title,
  description,
  pipe(...fns: ReadonlyArray<(self: KnobTheme<S>) => KnobTheme<S>>) {
    return pipeSelf(this, fns) as KnobTheme<S>
  },
})

/** Each value checked against its knob: an unknown group or knob, or a value out of range, throws. */
const checked = <S extends KnobSet>(knobs: S, values: Values<S>): Values<S> => {
  for (const [group, names] of Object.entries(values)) {
    if (!Object.hasOwn(knobs, group)) throw new Error(`Theme: no knob group "${group}".`)
    for (const [name, value] of Object.entries(names ?? {})) {
      if (!Object.hasOwn(knobs[group]!, name)) throw new Error(`Theme: no knob "${group}.${name}".`)
      Schema.decodeUnknownSync(knobs[group]![name]!.schema)(value)
    }
  }
  return values
}

/**
 * A theme of the standard knobs, or of `knobs`: the values it sets, checked,
 * every other knob keeping its default. A misspelt knob or a choice outside
 * its options is a type error; a number out of its range throws here.
 */
export function make(values: Values<Standard>): KnobTheme<Standard>
export function make<S extends KnobSet>(knobs: S, values: Values<NoInfer<S>>): KnobTheme<S>
export function make(...args: [Values<Standard>] | [KnobSet, Values<KnobSet>]): KnobTheme<KnobSet> {
  const [knobs, values] = args.length === 1 ? [standard, args[0]] : args
  return theme(knobs, checked(knobs, values), Option.none(), Option.none())
}

/** `theme` with `values` over its own, group by group. */
export const set =
  <S extends KnobSet>(values: Values<NoInfer<S>>) =>
  (self: KnobTheme<S>): KnobTheme<S> => {
    const merged: Record<string, Record<string, unknown>> = {}
    for (const source of [self.values, checked(self.knobs, values)])
      for (const [group, names] of Object.entries(source))
        merged[group] = { ...merged[group], ...names }
    return theme(self.knobs, merged as Values<S>, self.title, self.description)
  }

/** A title and a description for a list of themes; neither is the theme's identity. */
export const describe =
  (meta: { readonly title?: string; readonly description?: string }) =>
  <S extends KnobSet>(self: KnobTheme<S>): KnobTheme<S> =>
    theme(
      self.knobs,
      self.values,
      meta.title === undefined ? self.title : Option.some(meta.title),
      meta.description === undefined ? self.description : Option.some(meta.description),
    )

/** Every knob variable `self` declares: the values it sets, and every other knob's unset value. */
export const variables = <S extends KnobSet>(self: KnobTheme<S>): Knob.Variables => {
  const declared: Record<string, string> = {}
  for (const [group, knobs] of Object.entries(self.knobs))
    for (const [name, knob] of Object.entries(knobs)) {
      const value = (self.values[group] as Readonly<Record<string, unknown>> | undefined)?.[name]
      Object.assign(declared, knob.unset, value === undefined ? {} : knob.write(value))
    }
  return declared
}

/** `self`'s knob variables as tokens, for `Theme.root` and `Theme.scoped`. */
export const tokensOf = <S extends KnobSet>(self: KnobTheme<S>) => define({ knob: variables(self) })
