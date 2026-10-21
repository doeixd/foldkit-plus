/**
 * The theme the component pages draw in, and the themes `/create` makes.
 *
 * A theme is a typed set of the standard knobs' values (`Theme.make`), and
 * every token derives from knob variables. A custom property resolves where
 * it is declared, so a preview declares the whole theme on its own element
 * (`declared`), and the knob variables that differ from it are one rule over
 * every preview (`knobsPlace`), where every token re-derives from them.
 * The site's own look, on `:root`, is never touched.
 */
import { Record, Schema } from 'effect'
import { Icons } from 'foldkit-mixins-ui'
import {
  Knobs,
  Theme,
  VAR_PREFIX,
  type Control,
  type KnobAt,
  type PathOf,
  type Standard,
  type ValueOf,
  type Values,
} from 'foldkit-mixins/theme'
import * as heroicons from './packs/heroicons.js'
import * as hugeicons from './packs/hugeicons.js'
import * as lucide from './packs/lucide.js'
import * as phosphor from './packs/phosphor.js'
import * as tabler from './packs/tabler.js'

/** `system` follows the reader's color scheme. */
export const Scheme = Schema.Literals(['system', 'light', 'dark'])
export type Scheme = typeof Scheme.Type

export const Direction = Schema.Literals(['ltr', 'rtl'])
export type Direction = typeof Direction.Type

/** The panes `/create` groups its knobs into. */
export const Section = Schema.Literals(['theme', 'color', 'shape', 'type', 'icons', 'motion'])
export type Section = typeof Section.Type

export const sectionLabels: Readonly<Record<Section, string>> = {
  theme: 'Themes',
  color: 'Color',
  shape: 'Shape',
  type: 'Type',
  icons: 'Icons',
  motion: 'Motion',
}

/** A theme's values, as `/create`'s Model holds them. */
export type ThemeValues = Values<Standard>
export const ThemeValues: Schema.Codec<ThemeValues> = Knobs.schema(Knobs.standard)

/** One standard knob, by its group and name: `shape.radius`. */
export type KnobPath = PathOf<Standard>
/** Every standard knob's path, in the order the knobs are declared. */
export const knobPaths = Knobs.paths(Knobs.standard)
export const KnobPath = Schema.Literals(knobPaths)

/** The knob at `path`. */
export const knobAt = <P extends KnobPath>(path: P) => Knobs.at(Knobs.standard, path)

/** The knob at `path`, or its dark half: a schemed knob's halves each have a range of their own. */
export const halfAt = (path: KnobPath, dark: boolean) => {
  const knob = knobAt(path)
  return dark && 'dark' in knob ? knob.dark : knob
}

/** What `values` sets the knob at `path` to, or the knob's default. */
export const valueAt = <P extends KnobPath>(values: ThemeValues, path: P) =>
  Knobs.valueAt(Knobs.standard, values, path)

/** `values` with the knob at `path` set to `value`, which its knob checks. */
export const withValue = <P extends KnobPath>(
  values: ThemeValues,
  path: P,
  value: ValueOf<KnobAt<Standard, P>>,
): ThemeValues => Knobs.withValue(Knobs.standard, values, path, value)

/** A slider's value: clamped to its range and rounded to its step, without float noise. */
export const fit = (control: Extract<Control, { readonly kind: 'range' }>, value: number) => {
  const clamped = Math.min(control.max, Math.max(control.min, value))
  const stepped = control.min + Math.round((clamped - control.min) / control.step) * control.step
  return Number(stepped.toFixed(4))
}

/** Whether two themes set the same knobs to the same values: the source each prints. */
export const sameTheme = (a: ThemeValues, b: ThemeValues): boolean =>
  Theme.print(Theme.make(a)) === Theme.print(Theme.make(b))

export const fontLabels: Readonly<Record<keyof typeof Theme.fonts, string>> = {
  system: 'System',
  geist: 'Geist',
  roboto: 'Roboto',
  serif: 'Serif',
  mono: 'Mono',
  rounded: 'Rounded',
  classic: 'Classic',
}

/**
 * shadcn's base colors as a neutral hue and the surfaces' chroma, read from
 * its values (`apps/v4/registry/themes.ts`): the hue of each one's muted
 * surface, and a chroma that tints our surfaces about as much.
 */
const baseNames = ['neutral', 'stone', 'zinc', 'mauve', 'olive', 'mist', 'taupe'] as const
export const bases: Readonly<
  Record<(typeof baseNames)[number], { readonly h: number; readonly c: number }>
> = {
  neutral: { h: 0, c: 0 },
  stone: { h: 75, c: 0.004 },
  zinc: { h: 286, c: 0.004 },
  mauve: { h: 325, c: 0.007 },
  olive: { h: 106, c: 0.009 },
  mist: { h: 205, c: 0.006 },
  taupe: { h: 25, c: 0.006 },
}
/** The neutrals' hue: the accent's, or one of shadcn's base colors. */
export const Base = Schema.Literals(['accent', ...baseNames])
export type Base = typeof Base.Type

/** The base color `values`' neutrals are: the accent's when they follow it. */
export const baseOf = (values: ThemeValues): Base | 'custom' => {
  const hue = values.surface?.hue
  if (hue === undefined) return 'accent'
  const found = baseNames.find(base => bases[base].h === hue)
  return found ?? 'custom'
}

/** `values` with the neutrals of `base`, and the tint it brings. */
export const withBase = (values: ThemeValues, base: Base): ThemeValues => {
  const { hue: _, ...surface } = values.surface ?? {}
  return base === 'accent'
    ? { ...values, surface }
    : { ...values, surface: { ...surface, hue: bases[base].h, saturation: bases[base].c } }
}

/** The default theme, Iris: violet-blue on a cool page, in Geist. */
const iris = Theme.make({
  accent: { hue: 264, chroma: 0.17, lightness: 52 },
  surface: { saturation: 0.006, contrast: 24 },
  shape: { radius: 1.4 },
  type: { body: Theme.fonts.geist },
})

export const defaults: ThemeValues = iris.values

/** A style, as shadcn's: the shape and type knobs it moves, the colors left as they are. */
export interface Look {
  readonly name: string
  readonly description: string
  readonly values: ThemeValues
}

/** Every style sets the same knobs, so choosing one undoes another. */
export const looks: ReadonlyArray<Look> = [
  {
    name: 'Vega',
    description: 'Clean, neutral, familiar',
    values: {
      shape: { radius: 1, density: 1, size: 'default' },
      shadow: { strength: 100 },
      surface: { contrast: 24 },
      type: { body: Theme.fonts.geist, heading: 'inherit' },
    },
  },
  {
    name: 'Nova',
    description: 'Less padding and margin',
    values: {
      shape: { radius: 1, density: 0.85, size: 'default' },
      shadow: { strength: 80 },
      surface: { contrast: 24 },
      type: { body: Theme.fonts.geist, heading: 'inherit' },
    },
  },
  {
    name: 'Maia',
    description: 'Rounded, with room',
    values: {
      shape: { radius: 2.2, density: 1.15, size: 'default' },
      shadow: { strength: 100 },
      surface: { contrast: 22 },
      type: { body: Theme.fonts.system, heading: 'inherit' },
    },
  },
  {
    name: 'Lyra',
    description: 'Boxy and sharp, for mono',
    values: {
      shape: { radius: 0, density: 0.95, size: 'default' },
      shadow: { strength: 0 },
      surface: { contrast: 28 },
      type: { body: Theme.fonts.mono, heading: 'inherit' },
    },
  },
  {
    name: 'Mira',
    description: 'For compact interfaces',
    values: {
      shape: { radius: 0.8, density: 1, size: 'compact' },
      shadow: { strength: 60 },
      surface: { contrast: 24 },
      type: { body: Theme.fonts.geist, heading: 'inherit' },
    },
  },
  {
    name: 'Luma',
    description: 'Soft and luminous',
    values: {
      shape: { radius: 1.8, density: 1.05, size: 'default' },
      shadow: { strength: 50 },
      surface: { contrast: 14 },
      type: { body: Theme.fonts.system, heading: 'inherit' },
    },
  },
  {
    name: 'Sera',
    description: 'Editorial and typographic',
    values: {
      shape: { radius: 0.5, density: 1.05, size: 'default' },
      shadow: { strength: 40 },
      surface: { contrast: 20 },
      type: { body: Theme.fonts.system, heading: Theme.fonts.serif },
    },
  },
]

/** Whether `values` are in `look`'s shape: applying it changes nothing. */
export const inLook = (values: ThemeValues, chosen: Look): boolean =>
  sameTheme(withLook(values, chosen), values)

/** `values` with `look`'s shape and type over them. */
export const withLook = (values: ThemeValues, chosen: Look): ThemeValues =>
  Theme.make(values).pipe(Theme.set(chosen.values)).values

/** A whole theme, and the scheme it is known in, which choosing it shows. */
export interface Preset {
  readonly name: string
  readonly description: string
  readonly values: ThemeValues
  readonly scheme?: Exclude<Scheme, 'system'>
}

/** Iris with `over` set: a preset says only what makes it its own. */
const fromIris = (over: ThemeValues): ThemeValues => iris.pipe(Theme.set(over)).values

export const presets: ReadonlyArray<Preset> = [
  { name: 'Iris', description: 'The default: violet-blue on a cool page', values: defaults },
  {
    name: 'shadcn',
    description: 'Zinc neutrals, a near-black primary and tight headings, after shadcn/ui',
    scheme: 'light',
    values: fromIris({
      accent: { hue: 286, chroma: 0, lightness: 21 },
      surface: {
        hue: bases.zinc.h,
        saturation: 0.004,
        lightness: { light: 100, dark: 16 },
        contrast: 22,
        hover: 'neutral',
      },
      shape: { radius: 1.35 },
      shadow: { strength: 60, relief: 'soft' },
      type: { headingTracking: -0.025 },
    }),
  },
  {
    name: 'Material',
    description: 'Tonal surfaces, pill buttons, regular-weight Roboto headings, after Material 3',
    scheme: 'light',
    values: fromIris({
      accent: { hue: 293, chroma: 0.13, lightness: 44 },
      surface: {
        saturation: 0.02,
        contrast: 18,
        lightness: { light: 98.5, dark: 18 },
        hover: 'accent',
      },
      shape: { radius: 1.6, density: 1.1, controls: 'pill' },
      shadow: { strength: 70, relief: 'soft' },
      type: {
        body: Theme.fonts.roboto,
        headingWeight: 400,
        headingTracking: 0,
        headingScale: 1.15,
      },
      motion: { easing: 'spring' },
    }),
  },
  {
    name: 'Windows 95',
    description: 'Silver grey, navy, beveled controls, dark frames and square corners',
    scheme: 'light',
    values: fromIris({
      accent: { hue: 264, chroma: 0.19, lightness: 30 },
      surface: {
        hue: bases.neutral.h,
        saturation: 0,
        contrast: 44,
        lightness: { light: 80, dark: 22 },
        hover: 'neutral',
      },
      shape: { outlines: 'ink', radius: 0, density: 0.9, size: 'compact' },
      shadow: { strength: 100, style: 'hard', relief: 'bevel' },
      motion: { scale: 0 },
      type: {
        body: Theme.fonts.classic,
        scale: 0.9,
        headingScale: 0.7,
        headingWeight: 700,
        headingTracking: 0,
      },
    }),
  },
  {
    name: 'Brutalist',
    description: 'Black lines, hard shadows, heavy tight headings and a loud yellow',
    scheme: 'light',
    values: fromIris({
      accent: { hue: 100, chroma: 0.19, lightness: 88 },
      surface: {
        hue: bases.neutral.h,
        saturation: 0,
        contrast: 34,
        lightness: { light: 98, dark: 22 },
        hover: 'neutral',
      },
      shape: { outlines: 'ink', radius: 0.3, border: 2 },
      shadow: { strength: 100, style: 'hard', relief: 'hard' },
      type: { headingScale: 1.3, headingWeight: 800, headingTracking: -0.03 },
    }),
  },
  {
    name: 'Solarized',
    description: 'Base3 cream, blue, and type set in mono, after Ethan Schoonover’s palette',
    scheme: 'light',
    values: fromIris({
      accent: { hue: 245, chroma: 0.14, lightness: 60 },
      surface: { hue: bases.stone.h, saturation: 0.03, lightness: { light: 96.5, dark: 27 } },
      shape: { radius: 0.6 },
      shadow: { strength: 30 },
      type: { body: Theme.fonts.mono, headingWeight: 700, headingTracking: 0, headingScale: 0.85 },
    }),
  },
  {
    name: 'Nord',
    description: 'Frost blue on the polar night, after Nord',
    scheme: 'dark',
    values: fromIris({
      accent: { hue: 213, chroma: 0.07, lightness: 62 },
      surface: {
        saturation: 0.018,
        contrast: 22,
        lightness: { light: 95.5, dark: 32 },
        hover: 'neutral',
      },
      shape: { radius: 1 },
      shadow: { strength: 50 },
      type: { body: Theme.fonts.system, headingWeight: 500 },
    }),
  },
  {
    name: 'Ocean',
    description: 'A deep blue on blue-tinted surfaces',
    values: fromIris({
      accent: { hue: 232, chroma: 0.14, lightness: 50 },
      surface: { saturation: 0.014 },
    }),
  },
  {
    name: 'Forest',
    description: 'Leaf green, a little squarer',
    values: fromIris({ accent: { hue: 152, chroma: 0.12, lightness: 48 }, shape: { radius: 0.8 } }),
  },
  {
    name: 'Ember',
    description: 'Warm orange, tighter',
    values: fromIris({
      accent: { hue: 38, chroma: 0.17, lightness: 60 },
      shape: { radius: 0.6, density: 0.9 },
    }),
  },
  {
    name: 'Orchid',
    description: 'Pink, round and serif',
    values: fromIris({
      accent: { hue: 328, chroma: 0.16, lightness: 56 },
      surface: { saturation: 0.02 },
      shape: { radius: 2.2 },
      type: { body: Theme.fonts.serif, headingWeight: 500, headingTracking: 0 },
    }),
  },
  {
    name: 'Terminal',
    description: 'Phosphor green in mono on black: sharp, still, and barely any heading scale',
    scheme: 'dark',
    values: fromIris({
      accent: { hue: 145, chroma: 0.2, lightness: 55 },
      surface: { saturation: 0.012, lightness: { light: 97.5, dark: 12 }, hover: 'accent' },
      shape: { outlines: 'strong', radius: 0 },
      shadow: { strength: 0 },
      motion: { scale: 0 },
      type: { body: Theme.fonts.mono, headingScale: 0.5, headingWeight: 700, headingTracking: 0 },
    }),
  },
  {
    name: 'Cobalt',
    description:
      'A vivid blue on pure greys: round, roomy and flat, bold headings, menus inverted, on the spring',
    values: fromIris({
      accent: { hue: 235, chroma: 0.225, lightness: 55 },
      surface: {
        hue: bases.neutral.h,
        saturation: 0,
        contrast: 24,
        lightness: { light: 97, dark: 24.5 },
      },
      menu: { highlight: 'subtle', panel: 'inverted' },
      shape: { radius: 1.8, density: 1.1 },
      motion: { scale: 0.5, easing: 'spring' },
      shadow: { strength: 0 },
      type: {
        scale: 1.025,
        headingScale: 1.2,
        leading: 1.05,
        headingWeight: 700,
        headingTracking: -0.025,
      },
      scales: { chroma: 1.1 },
    }),
  },
]

/**
 * A theme drawn at random, to start from: every choice, and each slider
 * within the part of its range that keeps text readable.
 */
export const shuffled = (random: () => number): ThemeValues => {
  const pick = <A>(values: ReadonlyArray<A>): A =>
    values[Math.min(values.length - 1, Math.floor(random() * values.length))]!
  const between = (path: KnobPath, low: number, high: number, dark = false) => {
    const { control } = halfAt(path, dark)
    return control.kind === 'range' ? fit(control, low + random() * (high - low)) : low
  }
  const across = (path: KnobPath) => {
    const control = knobAt(path).control
    return control.kind === 'range' ? between(path, control.min, control.max) : 0
  }
  const drawn: ThemeValues = {
    accent: {
      hue: across('accent.hue'),
      chroma: between('accent.chroma', 0.06, 0.24),
      lightness: between('accent.lightness', 40, 65),
    },
    surface: {
      saturation: across('surface.saturation'),
      contrast: between('surface.contrast', 10, 40),
      lightness: {
        light: between('surface.lightness', 94, 100),
        // On the dark half's own slider.
        dark: between('surface.lightness', 14, 28, true),
      },
      hover: pick(['surface', 'neutral', 'accent'] as const),
    },
    shape: {
      radius: across('shape.radius'),
      density: across('shape.density'),
      size: pick(['default', 'compact'] as const),
      controls: pick(['rounded', 'pill'] as const),
      border: pick([1, 1, 1, 2]),
      outlines: pick(['soft', 'soft', 'strong'] as const),
    },
    shadow: {
      strength: across('shadow.strength'),
      style: pick(['soft', 'soft', 'soft', 'hard'] as const),
      // Mostly flat or soft: a bevel or a hard edge on every other shuffle reads as noise.
      relief: pick(['flat', 'flat', 'soft', 'soft', 'hard', 'bevel'] as const),
    },
    type: {
      body: pick(Object.values(Theme.fonts)),
      heading: pick(['inherit', ...Object.values(Theme.fonts)]),
      scale: between('type.scale', 0.9, 1.15),
      headingScale: between('type.headingScale', 0.7, 1.4),
      leading: between('type.leading', 0.95, 1.15),
      headingWeight: pick([400, 500, 600, 700, 800]),
      headingTracking: between('type.headingTracking', -0.03, 0.01),
    },
    motion: { scale: 1, easing: pick(['ease', 'spring'] as const) },
    menu: {
      highlight: pick(['subtle', 'bold'] as const),
      panel: pick(['default', 'inverted', 'translucent', 'inverted-translucent'] as const),
    },
    scales: { chroma: between('scales.chroma', 0.7, 1.2) },
  }
  // A base color brings its own tint, as choosing one does: Neutral is grey.
  return withBase(drawn, pick(Base.literals))
}

/** The palette's derivations with the default theme's knobs: what every preview declares. */
const theme = Theme.standard(iris)

const declarationsOf = (
  tokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<`--${string}`, string> => {
  const declared: Record<`--${string}`, string> = {}
  for (const [group, names] of Object.entries(tokens))
    for (const [name, value] of Object.entries(names))
      declared[`${VAR_PREFIX}-${group}-${name}`] = value
  return declared
}

/** Every token of the default theme, for a preview's own rule. */
export const declared = declarationsOf(theme)

/**
 * Where the reader's knobs are kept, and the frames they apply to:
 * `Theme.knobScript` applies them in the page's head before the first paint,
 * and `keepKnobs` on each change after.
 */
export const knobsPlace = { key: 'foldkit-site-knobs', selector: '[data-size]' } as const

/** `values`' knobs on every preview frame, and kept for the next page: the default keeps nothing. */
export const keepKnobs = (values: ThemeValues) =>
  Theme.chooseKnobs(Theme.make(values), { base: iris, ...knobsPlace })

/** A preview's color scheme, on its frame: `system` follows the reader's. */
export const schemeStyleOf = (scheme: Scheme): Record<string, string> => ({
  colorScheme: scheme === 'system' ? 'light dark' : scheme,
})

/** The icon packs `/create` offers for the components' own icons; Lucide's are the theme's. */
export const Pack = Schema.Literals(['lucide', 'tabler', 'phosphor', 'heroicons', 'hugeicons'])
export type Pack = typeof Pack.Type

export const packs = {
  lucide: { label: 'Lucide', ...lucide },
  tabler: { label: 'Tabler', ...tabler },
  phosphor: { label: 'Phosphor', ...phosphor },
  heroicons: { label: 'Heroicons', ...heroicons },
  hugeicons: { label: 'Hugeicons', ...hugeicons },
} as const satisfies Record<Pack, { readonly label: string }>

// Made once: a pack's masks are the same on every frame.
const packStyles = Record.map(packs, ({ icons }) =>
  Object.fromEntries(
    Object.entries(Icons.tokens(icons).icon).map(([name, mask]) => [
      `${VAR_PREFIX}-icon-${name}`,
      mask,
    ]),
  ),
)

/** A preview's icon variables for `pack`: none for Lucide, which the theme already holds. */
export const packStyleOf = (pack: Pack): Readonly<Record<string, string>> =>
  pack === 'lucide' ? {} : packStyles[pack]

/** The lines that make `pack` the application's, beside its theme: none for the shipped one. */
const packLines = (
  pack: Pack,
): { readonly imports: ReadonlyArray<string>; readonly tokens: string } => {
  if (pack === 'lucide') return { imports: [], tokens: '' }
  const entries = Object.entries(packs[pack].imports)
  const sets = [...new Set(entries.map(([, from]) => from.set))]
  return {
    imports: [
      "import { Icons } from 'foldkit-mixins-ui'",
      ...sets.map(
        set =>
          `import { ${entries
            .filter(([, from]) => from.set === set)
            .map(([, from]) => from.name)
            .join(', ')} } from 'virtual:foldkit-icons/${set}'`,
      ),
    ],
    tokens: `, tokens: Icons.tokens({ ${entries
      .map(([name, from]) => {
        // Quoted only where a key cannot stand bare, as a person would write it.
        const key = /^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`
        return name === from.name ? name : `${key}: ${from.name}`
      })
      .join(', ')} })`,
  }
}

/** `values`, and the icon pack, as the source an application pastes into its style module. */
export const codeOf = (values: ThemeValues, pack: Pack = 'lucide'): string => {
  const icons = packLines(pack)
  return [
    "import { AppStyle } from 'foldkit-mixins/app'",
    "import { Theme } from 'foldkit-mixins/theme'",
    ...icons.imports,
    '',
    `const theme = ${Theme.print(Theme.make(values))}`,
    '',
    `export const { t, slots, forSlots, stylesheet } = AppStyle.make({ theme${icons.tokens} })`,
    '',
  ].join('\n')
}
