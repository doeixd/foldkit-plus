/**
 * The standard knobs, and a theme as a typed set of their values.
 *
 * `Knobs.standard` is every knob the shipped tokens and palette read, grouped
 * by concern. A theme (`Theme.make`) holds the values it sets and nothing
 * else; `Theme.variables` writes them, every knob it leaves unset holding its
 * default or the expression it follows (`docs/theme-knobs.md`).
 */
import { Cause, Exit, Option, Schema } from 'effect'
import { DiagnosticError } from '../diagnostics.js'
import { pipeSelf, type Pipeable } from '../pipe.js'
import { own } from '../record.js'
import { define } from './core.js'
import { boundaryVariables } from './gamut.js'
import * as Knob from './knob.js'
import { asVariables, elevation, reliefs } from './shadows.js'

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

const hue = <const Name extends string>(
  variable: Name,
  value: number,
  title: string,
  description: string,
) => Knob.angle({ variable, default: value, min: 0, max: 360, title, description })
const ref = (group: string, name: string) => `var(--fk-${group}-${name})`

export const standard = {
  accent: {
    hue: Knob.angle({
      title: 'Hue',
      variable: 'accent-h',
      default: 235,
      min: 0,
      max: 360,
      description:
        'The accent’s place on the color wheel, in degrees: about 25 is red, 145 green, 264 blue. Buttons, links, focus rings and selections take it.',
    }),
    chroma: Knob.schemed(
      Knob.number({
        title: 'Chroma',
        variable: 'accent-c',
        default: 0.225,
        min: 0,
        max: 0.4,
        step: 0.005,
        description:
          'How vivid the accent is. 0 is grey; around 0.2 is as vivid as most screens show.',
      }),
      Knob.number({
        title: 'Chroma, dark',
        variable: 'accent-c-dark',
        default: 0.255,
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
        title: 'Lightness',
        variable: 'accent-l',
        default: 55,
        min: 5,
        max: 98,
        step: 1,
        description:
          'How light the accent is in the light scheme: near 10 a black accent, as shadcn’s.',
      }),
      Knob.percent({
        title: 'Lightness, dark',
        variable: 'accent-l-dark',
        default: 70,
        min: 5,
        max: 98,
        step: 1,
        description: 'How light the accent is in the dark scheme.',
      }),
    ),
    secondaryShift: Knob.angle({
      title: 'Secondary hue shift',
      variable: 'secondary-shift',
      default: 60,
      description: 'Degrees from the accent’s hue to the secondary family’s.',
    }),
    tertiaryShift: Knob.angle({
      title: 'Tertiary hue shift',
      variable: 'tertiary-shift',
      default: -90,
      description: 'Degrees from the accent’s hue to the tertiary family’s.',
    }),
  },
  surface: {
    hue: Knob.angle({
      title: 'Neutral hue',
      variable: 'neutral-h',
      default: 235,
      follows: ref('hue', 'accent'),
      min: 0,
      max: 360,
      description:
        'The hue the neutrals are mixed from: the page, text and borders. Unset, the accent’s own.',
    }),
    saturation: Knob.schemed(
      Knob.number({
        title: 'Surface tint',
        variable: 'surface-c',
        default: 0,
        min: 0,
        max: 0.04,
        step: 0.001,
        description: 'How much the page, cards and borders lean toward their hue. 0 is pure grey.',
      }),
      Knob.number({
        title: 'Surface tint, dark',
        variable: 'surface-c-dark',
        default: 0,
        follows: `calc(${ref('knob', 'surface-c')} * 4 / 3)`,
        min: 0,
        max: 0.04,
        step: 0.001,
        description: 'How much the dark scheme’s surfaces lean toward their hue.',
      }),
    ),
    lightness: Knob.schemed(
      Knob.percent({
        title: 'Page lightness',
        variable: 'base-l',
        default: 100,
        min: 75,
        max: 100,
        step: 0.5,
        description:
          'How light the page is in the light scheme. Cards, fields and hovers step from it.',
      }),
      Knob.percent({
        title: 'Page lightness, dark',
        variable: 'base-l-dark',
        default: 24.5,
        min: 6,
        max: 36,
        step: 0.5,
        description:
          'How light the page is in the dark scheme. Cards, fields and hovers step from it.',
      }),
    ),
    contrast: Knob.percent({
      title: 'Surface contrast',
      variable: 'surface-contrast',
      default: 80,
      min: 0,
      max: 100,
      step: 1,
      description:
        'How far apart the surface steps are: the page, a card on it, a field, a hover. Low is flat; high sets each apart.',
    }),
    textContrast: Knob.number({
      title: 'Text contrast',
      variable: 'contrast-factor',
      default: 1,
      min: 0,
      max: 2,
      step: 0.05,
      description: 'Multiplies the text’s chroma.',
    }),
    hover: Knob.choice({
      title: 'Hover',
      default: 'surface',
      options: {
        surface: { 'surface-ink': '1', 'state-ink': 'currentColor' },
        neutral: { 'surface-ink': '0', 'state-ink': 'currentColor' },
        accent: { 'surface-ink': '1', 'state-ink': ref('accent', 'ink') },
      },
      description:
        'What a hovered row or button is tinted with: a step of the surface, a plain grey, or the accent.',
    }),
    hoverStrength: Knob.percent({
      title: 'Hover strength',
      variable: 'state-hover',
      default: 12,
      min: 4,
      max: 24,
      step: 1,
      description:
        'How strongly a hovered row or button is tinted, a fluid highlight with it, and a press more.',
    }),
  },
  state: {
    disabledOpacity: Knob.number({
      title: 'Disabled',
      variable: 'state-disabled',
      default: 0.5,
      min: 0.3,
      max: 0.7,
      step: 0.05,
      description: 'How far a disabled control fades: 0.5 is half, 1 draws it as any other.',
    }),
  },
  shape: {
    radius: Knob.number({
      title: 'Radius',
      variable: 'radius-factor',
      default: 0.45,
      min: 0,
      max: 2.5,
      step: 0.05,
      description:
        'Multiplies every corner. 0 is square. A control inside a card keeps inside the card’s corner.',
    }),
    density: Knob.number({
      title: 'Density',
      variable: 'density',
      default: 1.1,
      min: 0.75,
      max: 1.3,
      step: 0.05,
      description:
        'Multiplies spacing: padding, gaps and margins. Below 1 is tighter, above 1 roomier.',
    }),
    size: Knob.choice({
      title: 'Size',
      default: 'default',
      options: { default: { step: '0' }, compact: { step: '1' } },
      description: 'How tall controls are: 36px, or a compact 28px.',
    }),
    controls: Knob.choice({
      title: 'Buttons',
      default: 'rounded',
      options: { rounded: { 'control-round': '0' }, pill: { 'control-round': '1' } },
      description: 'The corners of buttons: the radius’s, or fully round pills.',
    }),
    border: Knob.length('px')({
      title: 'Border',
      variable: 'border-width',
      default: 1,
      min: 1,
      max: 3,
      step: 1,
      description: 'The thinnest border’s width; the thicker ones step up from it.',
    }),
    // How much of the text's own ink the outlines take over the palette's
    // lines, at three strengths for subtle, default and overt.
    outlines: Knob.choice({
      title: 'Outlines',
      default: 'soft',
      options: {
        soft: {
          'outline-ink': '0',
          'outline-ink-subtle': '0%',
          'outline-ink-default': '0%',
          'outline-ink-overt': '0%',
        },
        strong: {
          'outline-ink': '1',
          'outline-ink-subtle': '22%',
          'outline-ink-default': '48%',
          'outline-ink-overt': '72%',
        },
        ink: {
          'outline-ink': '1',
          'outline-ink-subtle': '45%',
          'outline-ink-default': '88%',
          'outline-ink-overt': '100%',
        },
      },
      description:
        'How much borders show: the palette’s soft lines, darker ones, or lines in the text’s own ink.',
    }),
  },
  type: {
    body: Knob.font({
      title: 'Font',
      variable: 'font-body',
      default: 'system-ui, sans-serif',
      description: 'The typeface for body text and controls.',
    }),
    heading: Knob.font({
      title: 'Heading font',
      variable: 'font-heading',
      default: 'inherit',
      description: 'The typeface for headings. `inherit` is the body’s.',
    }),
    headingWeight: Knob.number({
      title: 'Heading weight',
      variable: 'heading-weight',
      default: 700,
      min: 100,
      max: 900,
      step: 100,
      description: 'How bold headings are, from 300 (light) to 900 (black).',
    }),
    headingTracking: Knob.length('em')({
      title: 'Heading tracking',
      variable: 'heading-tracking',
      default: -0.025,
      min: -0.05,
      max: 0.05,
      step: 0.005,
      description:
        'Headings’ letter spacing, in em: negative draws letters together, positive spreads them.',
    }),
    scale: Knob.number({
      title: 'Text size',
      variable: 'text-scale',
      default: 1.025,
      min: 0.8,
      max: 1.3,
      step: 0.025,
      description: 'Multiplies every text size, headings and body alike.',
    }),
    headingScale: Knob.number({
      title: 'Heading scale',
      variable: 'heading-scale',
      default: 1.2,
      min: 0.4,
      max: 1.8,
      step: 0.05,
      description:
        'How far headings stand above body text: below 1 nearer its size, above 1 larger.',
    }),
    leading: Knob.number({
      title: 'Line height',
      variable: 'leading',
      default: 1.05,
      min: 0.85,
      max: 1.3,
      step: 0.05,
      description: 'Multiplies line height, the space each line of text takes.',
    }),
    fluid: Knob.number({
      title: 'Fluid type',
      variable: 'fluid',
      default: 1,
      min: 0,
      max: 1,
      step: 0.05,
      description:
        'How much larger type grows between the small and large viewport. 0 keeps one size; 1 uses the whole range.',
    }),
    viewportMin: Knob.length('px')({
      title: 'Small viewport',
      variable: 'fluid-viewport-min',
      default: 320,
      min: 240,
      max: 800,
      step: 10,
      description: 'The viewport where every fluid size is its smallest, in px.',
    }),
    viewportMax: Knob.length('px')({
      title: 'Large viewport',
      variable: 'fluid-viewport-max',
      default: 1440,
      min: 900,
      max: 2560,
      step: 10,
      description: 'The viewport where every fluid size is its largest, in px.',
    }),
  },
  reading: {
    measure: Knob.length('ch')({
      title: 'Reading measure',
      variable: 'measure',
      default: 68,
      min: 30,
      max: 100,
      step: 1,
      description:
        'The widest a line of reading text may run, in ch. Around 65 is a book’s measure; wider is harder to track back from.',
    }),
    headingWrap: Knob.choice({
      title: 'Heading wrap',
      default: 'balance',
      options: {
        balance: { 'heading-wrap': 'balance' },
        pretty: { 'heading-wrap': 'pretty' },
        wrap: { 'heading-wrap': 'wrap' },
      },
      description:
        'How a heading breaks across lines: balanced lines, a prettier last line, or the browser’s ordinary wrap.',
    }),
    bodyWrap: Knob.choice({
      title: 'Body wrap',
      default: 'pretty',
      options: {
        pretty: { 'body-wrap': 'pretty' },
        wrap: { 'body-wrap': 'wrap' },
        balance: { 'body-wrap': 'balance' },
      },
      description:
        'How body copy breaks: a prettier last line, the browser’s ordinary wrap, or balanced lines.',
    }),
    align: Knob.choice({
      title: 'Reading alignment',
      default: 'start',
      options: {
        start: { 'reading-align': 'start' },
        center: { 'reading-align': 'center' },
        end: { 'reading-align': 'end' },
        justify: { 'reading-align': 'justify' },
      },
      description:
        'The alignment of reading text: start, centered, end, or justified. Start follows the writing direction.',
    }),
  },
  icon: {
    size: Knob.number({
      title: 'Icon size',
      variable: 'icon-scale',
      default: 1,
      min: 0.75,
      max: 1.5,
      step: 0.05,
      description:
        'Multiplies every icon a component draws, beside its words: 1 is 16px, or 14px compact.',
    }),
    stroke: Knob.length('px')({
      title: 'Glyph stroke',
      variable: 'glyph-width',
      default: 2,
      min: 1,
      max: 3,
      step: 0.25,
      description:
        'The width of the strokes components draw themselves: checks, chevrons, a tree’s guides. An icon pack keeps its own.',
    }),
  },
  motion: {
    scale: Knob.number({
      title: 'Motion',
      variable: 'motion',
      default: 0.5,
      min: 0,
      max: 2,
      step: 0.1,
      description: 'Multiplies how long every transition takes. 0 stills them; 2 is twice as slow.',
    }),
    easing: Knob.choice({
      title: 'Easing',
      default: 'spring',
      options: { ease: { ease: 'ease-out' }, spring: { ease: ref('motion', 'spring') } },
      description: 'How transitions move: along an easing curve, or on a spring that settles.',
    }),
  },
  shadow: {
    style: Knob.choice({
      title: 'Shadows',
      default: 'soft',
      options: {
        soft: asVariables('shadow', elevation.soft),
        hard: asVariables('shadow', elevation.hard),
      },
      description: 'Shadows that diffuse softly, or hard, solid offset copies.',
    }),
    relief: Knob.choice({
      title: 'Controls',
      default: 'flat',
      options: {
        flat: asVariables('relief', reliefs.flat),
        soft: asVariables('relief', reliefs.soft),
        hard: asVariables('relief', reliefs.hard),
        bevel: asVariables('relief', reliefs.bevel),
      },
      description:
        'How buttons stand off the page and fields sink into it: flat, or a soft, hard or bevelled edge.',
    }),
    strength: Knob.percent({
      title: 'Shadow',
      variable: 'shadow-strength',
      default: 0,
      min: 0,
      max: 100,
      step: 1,
      description: 'How strong shadows are. 0 removes them.',
    }),
    hue: Knob.angle({
      title: 'Shadow hue',
      variable: 'shadow-h',
      default: 235,
      follows: ref('hue', 'neutral'),
      min: 0,
      max: 360,
      description: 'The hue every shadow is tinted with. Unset, the neutrals’.',
    }),
    chroma: Knob.number({
      title: 'Shadow tint',
      variable: 'shadow-c',
      default: 0,
      follows: `calc(${ref('knob', 'surface-c')} * 2)`,
      min: 0,
      max: 0.1,
      step: 0.005,
      description: 'How tinted every shadow is. Unset, twice the surfaces’ saturation.',
    }),
  },
  menu: {
    highlight: Knob.choice({
      title: 'Menu accent',
      default: 'subtle',
      options: { subtle: { 'popup-bold': '0' }, bold: { 'popup-bold': '1' } },
      description:
        'How the highlighted row of a menu shows: a subtle tint, or filled with the accent.',
    }),
    panel: Knob.choice({
      title: 'Menu color',
      default: 'inverted',
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
    success: hue('success-h', 145, 'Success', 'The hue of success: a saved form, a passing check.'),
    warning: hue('warning-h', 75, 'Warning', 'The hue of a warning.'),
    error: hue('error-h', 25, 'Error', 'The hue of an error: a refused field, a failed save.'),
    info: hue('info-h', 245, 'Info', 'The hue of a neutral notice.'),
  },
  code: {
    chroma: Knob.number({
      title: 'Code chroma',
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
      'Chart hue',
      'The first chart series’ hue; the other four keep their places around it.',
    ),
  },
  scales: {
    chroma: Knob.number({
      title: 'Scale vividness',
      variable: 'scale-c',
      default: 1.1,
      min: 0,
      max: 1.5,
      step: 0.05,
      description:
        'How vivid the seven color scales are, as a share of each step’s own. 0 turns them grey.',
    }),
    red: hue('red-h', 25, 'Red', 'The red scale’s hue.'),
    orange: hue('orange-h', 55, 'Orange', 'The orange scale’s hue.'),
    yellow: hue('yellow-h', 90, 'Yellow', 'The yellow scale’s hue.'),
    green: hue('green-h', 145, 'Green', 'The green scale’s hue.'),
    teal: hue('teal-h', 185, 'Teal', 'The teal scale’s hue.'),
    blue: hue('blue-h', 255, 'Blue', 'The blue scale’s hue.'),
    purple: hue('purple-h', 300, 'Purple', 'The purple scale’s hue.'),
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

/** The call a refusal names: a theme is usually built at module load, where a stack names only the module. */
type Caller = 'Theme.make' | 'Theme.set' | 'Knobs.withValue'

const unknownKnob = (caller: Caller, knob: string): DiagnosticError =>
  new DiagnosticError({
    source: 'theme',
    code: 'theme:unknown-knob',
    severity: 'error',
    message: `${caller}: no knob "${knob}".`,
    details: { knob },
  })

/** Throws, naming the knob and the call, when `knob` refuses `value`. */
const checkValue = (caller: Caller, path: string, knob: Knob.Knob<unknown>, value: unknown) => {
  const decoded = Schema.decodeUnknownExit(knob.schema)(value)
  if (Exit.isSuccess(decoded)) return
  throw new DiagnosticError({
    source: 'theme',
    code: 'theme:knob-value',
    severity: 'error',
    message: `${caller}: ${path} refuses its value: ${Cause.pretty(decoded.cause)}`,
    details: { knob: path, value },
  })
}

/** Each value checked against its knob: an unknown group or knob, or a value out of range, throws. */
const checked = <S extends KnobSet>(caller: Caller, knobs: S, values: Values<S>): Values<S> => {
  for (const [group, names] of Object.entries(values)) {
    if (!Object.hasOwn(knobs, group)) throw unknownKnob(caller, group)
    for (const [name, value] of Object.entries(names ?? {})) {
      const path = `${group}.${name}`
      if (!Object.hasOwn(knobs[group]!, name)) throw unknownKnob(caller, path)
      checkValue(caller, path, knobs[group]![name]!, value)
    }
  }
  return values
}

/** What `values` set the knob `group.name` to, read from their own keys alone. */
const setIn = (values: object, group: string, name: string): unknown =>
  own(own(values as Readonly<Record<string, Readonly<Record<string, unknown>>>>, group), name)

const valueOf = <S extends KnobSet>(
  knobs: S,
  values: Values<S>,
  group: string,
  name: string,
): unknown => {
  const set = (values[group] as Readonly<Record<string, unknown>> | undefined)?.[name]
  return (
    set ??
    (knobs[group] as Readonly<Record<string, Knob.Knob<unknown>>> | undefined)?.[name]?.default
  )
}

/**
 * A cross-knob rule each knob's schema cannot state: the fluid range's two
 * halves must not cross. Read from the merged values, each unset half from its
 * knob's default, so `Theme.set` and `Theme.make` both refuse an inverted range.
 */
const validate = <S extends KnobSet>(knobs: S, values: Values<S>): void => {
  const group = knobs['type'] as Readonly<Record<string, Knob.Knob<unknown>>> | undefined
  if (
    group === undefined ||
    !Object.hasOwn(group, 'viewportMin') ||
    !Object.hasOwn(group, 'viewportMax')
  )
    return
  const min = valueOf(knobs, values, 'type', 'viewportMin')
  const max = valueOf(knobs, values, 'type', 'viewportMax')
  if (typeof min !== 'number' || typeof max !== 'number' || min < max) return
  throw new DiagnosticError({
    source: 'theme',
    code: 'theme:fluid-range',
    severity: 'error',
    message: `Theme: type.viewportMin (${min}px) must be less than type.viewportMax (${max}px).`,
    details: { min, max },
  })
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
  const checkedValues = checked('Theme.make', knobs, values)
  validate(knobs, checkedValues)
  return theme(knobs, checkedValues, Option.none(), Option.none())
}

/** `theme` with `values` over its own, group by group. */
export const set =
  <S extends KnobSet>(values: Values<NoInfer<S>>) =>
  (self: KnobTheme<S>): KnobTheme<S> => {
    const merged: Record<string, Record<string, unknown>> = Object.create(null)
    for (const source of [self.values, checked('Theme.set', self.knobs, values)])
      for (const [group, names] of Object.entries(source))
        merged[group] = { ...merged[group], ...names }
    validate(self.knobs, merged as Values<S>)
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

/**
 * Every knob variable `self` declares: the values it sets, every other knob's
 * unset value, and the sRGB boundary of each palette hue they place.
 */
export const variables = <S extends KnobSet>(self: KnobTheme<S>): Knob.Variables => {
  const declared: Record<string, string> = {}
  for (const [group, knobs] of Object.entries(self.knobs))
    for (const [name, knob] of Object.entries(knobs)) {
      const value = setIn(self.values, group, name)
      Object.assign(declared, knob.unset, value === undefined ? {} : knob.write(value))
    }
  return Object.assign(declared, boundaryVariables(declared))
}

type Intersected<U> = (U extends unknown ? (union: U) => void : never) extends (
  meet: infer I,
) => void
  ? I
  : never

/** What every knob of `knobs` writes unset, under its variables' own names. */
export const unsetOf = <S extends KnobSet>(
  knobs: S,
): Intersected<{ [G in keyof S]: { [K in keyof S[G]]: S[G][K]['unset'] }[keyof S[G]] }[keyof S]> =>
  Object.assign(
    {},
    ...Object.values(knobs).flatMap(group => Object.values(group).map(knob => knob.unset)),
  )

/** `self`'s knob variables as tokens, for `Theme.root` and `Theme.scoped`. */
export const tokensOf = <S extends KnobSet>(self: KnobTheme<S>) => define({ knob: variables(self) })

/**
 * The Schema of a theme's values over `knobs`: each group and knob optional,
 * each value checked by its knob, for a Model field or a decoded URL. Decode
 * with `onExcessProperty: 'error'` where an unknown key must be refused
 * rather than dropped.
 */
export const schemaOf = <S extends KnobSet>(knobs: S): Schema.Codec<Values<S>> =>
  // Built from `knobs` group by group, so its type is `Values<S>` by construction.
  Schema.Struct(
    Object.fromEntries(
      Object.entries(knobs).map(([group, names]) => [
        group,
        Schema.optionalKey(
          Schema.Struct(
            Object.fromEntries(
              Object.entries(names).map(([name, knob]) => [name, Schema.optionalKey(knob.schema)]),
            ),
          ),
        ),
      ]),
    ),
  ) as unknown as Schema.Codec<Values<S>>

const literal = (value: unknown): string =>
  typeof value === 'string'
    ? `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
    : typeof value === 'object' && value !== null
      ? `{ ${Object.entries(value)
          .map(([key, each]) => `${key}: ${literal(each)}`)
          .join(', ')} }`
      : String(value)

/**
 * Whether `value` changes nothing the knob writes unset: a bare `0.17` for a
 * schemed knob whose dark half follows is its default, though it is no
 * `{ light, dark }`.
 */
const atDefault = (knob: Knob.Knob<unknown>, value: unknown): boolean =>
  Object.entries(knob.write(value)).every(([name, css]) => knob.unset[name] === css)

/**
 * The source of `self` as `Theme.make({ … })`: each knob it sets that writes
 * other than the knob's default does, a group to a line (a knob a line past
 * a hundred characters), so the code an application
 * pastes says only what makes the theme its own.
 */
export const print = <S extends KnobSet>(self: KnobTheme<S>): string => {
  const groups = Object.entries(self.knobs).flatMap(([group, knobs]) => {
    const set = Object.entries(knobs).flatMap(([name, knob]) => {
      const value = setIn(self.values, group, name)
      return value === undefined || atDefault(knob, value) ? [] : [`${name}: ${literal(value)}`]
    })
    if (set.length === 0) return []
    const line = `  ${group}: { ${set.join(', ')} },`
    // A group past the width a formatter keeps breaks to a knob a line, as one would.
    return line.length <= 100
      ? [line]
      : [`  ${group}: {`, ...set.map(each => `    ${each},`), '  },']
  })
  return groups.length === 0 ? 'Theme.make({})' : ['Theme.make({', ...groups, '})'].join('\n')
}

/** One knob of `S`, by its group and name: `shape.radius`. */
export type PathOf<S extends KnobSet> = {
  readonly [G in keyof S & string]: `${G}.${keyof S[G] & string}`
}[keyof S & string]

/** The knob of `S` at `P`. */
export type KnobAt<S extends KnobSet, P extends PathOf<S>> = P extends `${infer G}.${infer N}`
  ? G extends keyof S
    ? N extends keyof S[G]
      ? S[G][N]
      : never
    : never
  : never

const split = (path: string): readonly [string, string] => {
  const dot = path.indexOf('.')
  return [path.slice(0, dot), path.slice(dot + 1)]
}

/** Every knob's path in `knobs`, in the order they are declared. */
export const paths = <S extends KnobSet>(knobs: S): ReadonlyArray<PathOf<S>> =>
  Object.entries(knobs).flatMap(([group, names]) =>
    Object.keys(names).map(name => `${group}.${name}`),
  ) as ReadonlyArray<PathOf<S>>

/** The knob at `path`. */
export const at = <S extends KnobSet, P extends PathOf<S>>(knobs: S, path: P): KnobAt<S, P> => {
  const [group, name] = split(path)
  return knobs[group]![name] as KnobAt<S, P>
}

/** What `values` set the knob at `path` to, or its default. */
export const valueAt = <S extends KnobSet, P extends PathOf<S>>(
  knobs: S,
  values: Values<S>,
  path: P,
): ValueOf<KnobAt<S, P>> => {
  const [group, name] = split(path)
  return (setIn(values, group, name) ?? at(knobs, path).default) as ValueOf<KnobAt<S, P>>
}

/** `values` with the knob at `path` set to `value`, checked by the knob as `make` checks it. */
export const withValue = <S extends KnobSet, P extends PathOf<S>>(
  knobs: S,
  values: Values<S>,
  path: P,
  value: ValueOf<KnobAt<S, P>>,
): Values<S> => {
  const [group, name] = split(path)
  checkValue('Knobs.withValue', path, at(knobs, path), value)
  const next = { ...values, [group]: { ...values[group], [name]: value } } as Values<S>
  validate(knobs, next)
  return next
}
