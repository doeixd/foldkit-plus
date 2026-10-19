/**
 * A whole palette from a few knobs, as css-tags derives it: every value
 * except the knobs is a CSS expression over other tokens, so overriding a
 * knob on the element that declares the tokens (`:root`, or a scoped theme's
 * selector) re-derives the rest in the browser. A custom property resolves
 * where it is declared, so a knob overridden on a subtree below `:root`
 * changes nothing: declare the theme on that subtree too. Where light and dark schemes need different numbers
 * the value is a `light-dark()` pair, so one theme serves both and a user's
 * choice is a `color-scheme` override.
 */
import { define } from './core.js'
import { standard } from './knobs.js'

export interface OklchKnobs {
  /** The brand color: hue in degrees, chroma 0–0.4, lightness as a percentage. */
  readonly accent: {
    readonly h: number
    readonly c: number
    readonly l: string
    /** Lighter and stronger on dark surfaces; defaults `70%` and `c + 0.03`. */
    readonly dark?: { readonly l?: string; readonly c?: number }
  }
  /** Degrees added to the accent hue for the secondary and tertiary families. */
  readonly secondaryHueShift?: number
  readonly tertiaryHueShift?: number
  /**
   * The hue of the neutrals (surfaces, text, outlines, the shadow), apart
   * from the accent's, as a base color is: a warm stone under a blue accent.
   * Without it the neutrals take the accent's hue, and follow it when the
   * `accent-h` knob moves.
   */
  readonly neutral?: { readonly h: number }
  /**
   * The tint of every shadow: its hue (the neutrals' unless given) and chroma
   * (twice the surfaces' unless given), so a warm theme's cards cast a warm
   * shadow. `shadow-strength` still scales how much of it shows.
   */
  readonly shadow?: { readonly h?: number; readonly c?: number }
  /** Chroma of neutral surfaces; 0 is gray. */
  readonly surfaceSaturation?: number
  /** How far apart the surface steps are, 0–100%. */
  readonly surfaceContrast?: string
  /** Multiplies text chroma. */
  readonly contrastFactor?: number
  /** Chroma of the code colors (`syntax-*`), 0–0.4; default `0.14`. */
  readonly syntaxChroma?: number
  /**
   * How menus, listboxes and comboboxes draw their panels, as shadcn's menu
   * options: the row the keys or pointer are on in a tint of the text
   * (`subtle`, the default) or the accent's fill (`bold`); the panel in the
   * page's surface (`default`), the opposite scheme's (`inverted`), or either
   * see-through over a blur (`translucent`, `inverted-translucent`).
   */
  readonly menu?: {
    readonly accent?: 'subtle' | 'bold'
    readonly color?: 'default' | 'inverted' | 'translucent' | 'inverted-translucent'
  }
  /** Hues of the feedback families. */
  readonly feedback?: {
    readonly success?: number
    readonly warning?: number
    readonly error?: number
    readonly info?: number
  }
  /**
   * What a hover is made of: `neutral` mixes the element's own text, as
   * before; `surface` (the default) mixes a painted surface's own paint where
   * one names it (an alert band, a tone's fill), the text elsewhere; `accent`
   * leans every hover on the accent at low chroma, as Fluid's. One override
   * changes every component. Painted surfaces read the derived `surface-ink`
   * knob below (0 in `neutral`), so the choice also switches at runtime.
   */
  readonly stateHue?: 'neutral' | 'surface' | 'accent'
}

const v = (group: string, name: string) => `var(--fk-${group}-${name})`
/** A computed knob without float noise: `0.02`, not `0.019999999999999997`. */
const num = (value: number) => String(Number(value.toFixed(4)))
const ld = (light: string, dark: string) => `light-dark(${light}, ${dark})`
const offset = (amount: number) => `${amount < 0 ? '-' : '+'} ${Math.abs(amount)}`
/** `oklch(from <color> …)` with the hue kept. */
const from = (color: string, l: string, c: string) => `oklch(from ${color} ${l} ${c} h)`
const shift = (color: string, dl: number, dc: number) =>
  from(color, `calc(l ${offset(dl)})`, `calc(c ${offset(dc)})`)
const scale = (color: string, dl: number, cx: number) =>
  from(color, `calc(l ${offset(dl)})`, `calc(c * ${cx})`)
/** The same lightness and chroma as `color` on another hue. */
const rehue = (color: string, hue: string) => `oklch(from ${color} l c ${hue})`
/** Near-black or near-white text over `color`. */
const contrast = (color: string) =>
  `oklch(from ${color} clamp(0.1, (0.65 / l - 1) * 999, 0.98) min(c, 0.08) h)`
/** `color` as text on the base surface: dark in a light scheme, light in a dark one. */
const ink = (color: string) => ld(from(color, '0.5', 'c'), from(color, '0.8', 'c'))
/**
 * `color` tinted onto the base surface, the same in both schemes. Mixed in
 * OKLab, not OKLCH: OKLCH interpolates hue, so a mix mostly of the base keeps
 * the base's hue, and a green tinted onto a blue-grey base came out blue.
 */
const tint = (color: string, percent: number) =>
  `color-mix(in oklab, ${v('surface', 'base')} ${percent}%, ${color})`

const neutral = v('hue', 'neutral')
const base = v('surface', 'base')
const surfaceC = v('knob', 'surface-c')
const surfaceCDark = v('knob', 'surface-c-dark')
const contrastFactor = v('knob', 'contrast-factor')

type Step = readonly [lightness: number, chroma: number]

/**
 * How far a step's target lies past the offset it names: at the default
 * contrast (26%) a step sits where its offset says, and the whole knob spans
 * 2.5 times that, so its range is one a reader sees. At a reach of 1 the knob
 * at its top moved the muted surface four points of lightness.
 */
const REACH = 2.5
const reach = ([lightness, chroma]: Step): Step => [
  Number((lightness * REACH).toFixed(4)),
  Number((1 + (chroma - 1) * REACH).toFixed(4)),
]

/** A surface step: the base mixed toward a target by `surface-contrast`. */
const surfaceStep = (lightStep: Step, darkStep: Step) => {
  const amount = v('knob', 'surface-contrast')
  const [light, dark] = [reach(lightStep), reach(darkStep)]
  const target = ld(scale(base, light[0], light[1]), scale(base, dark[0], dark[1]))
  return `color-mix(in oklch, ${base} calc(100% - ${amount}), ${target} ${amount})`
}

/** `a` where the 0-or-1 knob `name` is 1, `b` where it is 0. */
const share = (a: string, name: string, b: string) =>
  `color-mix(in oklab, ${a} calc(${v('knob', name)} * 100%), ${b})`

/** A text color: fixed lightness, chroma scaled by surface saturation and the contrast factor. */
const text = (light: Step, dark: Step) =>
  ld(
    `oklch(${light[0]}% calc(${surfaceC} * ${light[1]} * ${contrastFactor}) ${neutral})`,
    `oklch(${dark[0]}% calc(${surfaceCDark} * ${dark[1]} * ${contrastFactor}) ${neutral})`,
  )

/**
 * A color family, every one the same shape: its fill, the fill hovered and
 * pressed, a tint of it on the base, a line in it that stands off the base
 * (darker in a light scheme, lighter in a dark one), and text on the fill
 * and in the family's color.
 */
const family = (name: string, defaultValue: string) => {
  const color = v(name, 'default')
  return {
    default: defaultValue,
    hover: shift(color, -0.06, 0),
    active: shift(color, -0.1, 0.05),
    subtle: tint(color, 85),
    outline: ld(shift(color, -0.05, 0), shift(color, 0.05, 0)),
    'on-fill': contrast(color),
    ink: ink(color),
  }
}

/**
 * A code color in `hue`: the same lightness for every kind, so no kind shouts,
 * dark enough to read on a light surface and light enough on a dark one.
 */
const syntaxInk = (hue: string) =>
  ld(`oklch(48% ${v('knob', 'syntax-c')} ${hue})`, `oklch(80% ${v('knob', 'syntax-c')} ${hue})`)

/**
 * A chart's series color: a hue a fixed turn from the first, at a lightness
 * and chroma chosen for that hue in each scheme (a yellow sits lighter than a
 * blue to read as strong). The five are the dataviz reference palette's first
 * slots, in its order, which keeps neighbors apart under protan and deutan
 * vision; moving `chart-h` turns them all and keeps the order.
 */
const chartInk = (turn: number, light: Step, dark: Step) => {
  const hue = `calc(${v('knob', 'chart-h')} ${offset(turn)})`
  return ld(`oklch(${light[0]} ${light[1]} ${hue})`, `oklch(${dark[0]} ${dark[1]} ${hue})`)
}

/** A feedback family, lighter in a dark scheme so its fill reads on a dark page. */
const feedback = (name: string, l: number, c: number, dark: number) =>
  family(
    name,
    ld(
      `oklch(${l}% ${c} ${v('knob', `${name}-h`)})`,
      `oklch(${dark}% ${c} ${v('knob', `${name}-h`)})`,
    ),
  )

/** The color scales, each named for its hue (a knob, `red-h`). */
type ScaleName = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple'

/**
 * One lightness ladder for every scale, near white to near black in even
 * steps, so step 6 of red is as light as step 6 of blue: a step number
 * means the same contrast in any hue (after css-tags' palette).
 */
const scaleL = [97, 88.5, 80, 71.5, 63, 54.5, 46, 37.5, 29, 20.5]
// Chroma swells toward the middle, where a screen can show most of it, and
// thins at both ends, where a vivid near-white or near-black falls out of gamut.
const scaleC = [0.02, 0.05, 0.09, 0.13, 0.16, 0.17, 0.155, 0.125, 0.09, 0.055]

/**
 * A color's ten steps, `1` the lightest, and four `wash`es: step 6 mixed
 * into the page, so a tinted ground follows the scheme and the surface
 * knobs as the page does.
 */
const colorScale = (name: ScaleName) => {
  const hue = v('knob', `${name}-h`)
  const step = (index: number) =>
    `oklch(${scaleL[index]}% calc(${scaleC[index]} * ${v('knob', 'scale-c')}) ${hue})`
  const wash = (share: number) =>
    `color-mix(in oklab, ${v(name, '6')} ${share}%, ${v('surface', 'base')})`
  return {
    '1': step(0),
    '2': step(1),
    '3': step(2),
    '4': step(3),
    '5': step(4),
    '6': step(5),
    '7': step(6),
    '8': step(7),
    '9': step(8),
    '10': step(9),
    'wash-1': wash(8),
    'wash-2': wash(16),
    'wash-3': wash(28),
    'wash-4': wash(44),
  }
}

/**
 * An outline, the palette's line until the `shape.outlines` knob gives it the
 * text's own ink: `outline-ink` 0 is the line itself, 1 the ink at its strength.
 */
const inked = (line: string, strength: 'subtle' | 'default' | 'overt') =>
  `color-mix(in oklch, ${line}, color-mix(in oklch, ${v('text', 'overt')} ${v('knob', `outline-ink-${strength}`)}, transparent) calc(${v('knob', 'outline-ink')} * 100%))`

export const oklch = (knobs: OklchKnobs) => {
  const accent = v('accent', 'default')
  const surfaceSaturation = knobs.surfaceSaturation ?? 0.015
  return define({
    knob: {
      'accent-h': String(knobs.accent.h),
      'accent-c': String(knobs.accent.c),
      'accent-l': knobs.accent.l,
      'accent-c-dark': num(knobs.accent.dark?.c ?? Math.min(0.4, knobs.accent.c + 0.03)),
      'accent-l-dark': knobs.accent.dark?.l ?? '70%',
      // The accent's hue unless one is given: an expression, so a moved accent moves it too.
      'neutral-h': knobs.neutral === undefined ? v('hue', 'accent') : String(knobs.neutral.h),
      'secondary-shift': String(knobs.secondaryHueShift ?? 60),
      'tertiary-shift': String(knobs.tertiaryHueShift ?? -90),
      'surface-c': String(surfaceSaturation),
      'surface-c-dark': num(surfaceSaturation * (4 / 3)),
      'surface-contrast': knobs.surfaceContrast ?? '26%',
      'contrast-factor': String(knobs.contrastFactor ?? 1),
      'base-l': '97.5%',
      'base-l-dark': '22%',
      'success-h': String(knobs.feedback?.success ?? 145),
      'warning-h': String(knobs.feedback?.warning ?? 75),
      'error-h': String(knobs.feedback?.error ?? 25),
      'info-h': String(knobs.feedback?.info ?? 245),
      'syntax-c': num(knobs.syntaxChroma ?? 0.14),
      // The first chart color's hue; the other four keep their places around it.
      'chart-h': '255',
      // 0 or 1, each blending one look into the other, so a knob override switches it.
      'popup-bold': knobs.menu?.accent === 'bold' ? '1' : '0',
      'popup-invert': knobs.menu?.color?.startsWith('inverted') === true ? '1' : '0',
      'popup-alpha': knobs.menu?.color?.endsWith('translucent') === true ? '0.8' : '1',
      'popup-blur': knobs.menu?.color?.endsWith('translucent') === true ? '12px' : '0px',
      // How much of the text a state lays over its surface.
      'state-hover': '12%',
      'state-tint': '8%',
      'state-tint-dark': '25%',
      // Whether a painted surface names its paint as the state ink: 1,
      // unless `stateHue` is `neutral`, when every hover mixes the text.
      ...standard.surface.hover.options[knobs.stateHue ?? 'surface'],
      ...standard.shape.outlines.unset,
      'image-edge': '10%',
      // The shadow's tint: the neutrals' hue, and a little more than their chroma.
      'shadow-h': knobs.shadow?.h === undefined ? v('hue', 'neutral') : String(knobs.shadow.h),
      'shadow-c': knobs.shadow?.c === undefined ? `calc(${surfaceC} * 2)` : num(knobs.shadow.c),
      // How much lighter each raised level is in a dark scheme.
      'raise-dark': '0.027',
      // The color scales' chroma, as a share of each step's own; their hues.
      'scale-c': '1',
      'red-h': '25',
      'orange-h': '55',
      'yellow-h': '90',
      'green-h': '145',
      'teal-h': '185',
      'blue-h': '255',
      'purple-h': '300',
    },
    hue: {
      accent: v('knob', 'accent-h'),
      secondary: `calc(${v('knob', 'accent-h')} + ${v('knob', 'secondary-shift')})`,
      tertiary: `calc(${v('knob', 'accent-h')} + ${v('knob', 'tertiary-shift')})`,
      neutral: v('knob', 'neutral-h'),
    },
    surface: {
      base: ld(
        `oklch(${v('knob', 'base-l')} calc(${surfaceC} * 0.9) ${neutral})`,
        `oklch(${v('knob', 'base-l-dark')} calc(${surfaceCDark} * 0.9) ${neutral})`,
      ),
      // A control's resting ground, separate from a neutral surface step so a
      // field can keep its contrast if the steps move: filled fields read it,
      // the page reads base.
      field: v('surface', 'default'),
      // Each step keeps about the base's chroma, so a sidebar, a panel and
      // the page read as one color at a few lightnesses: one with less reads
      // grey on the page, one with more reads as another, bluer color.
      muted: surfaceStep([-0.04, 1.2], [-0.03, 1.05]),
      subtle: surfaceStep([-0.025, 1.15], [-0.015, 1.05]),
      default: surfaceStep([-0.055, 1.25], [0.045, 1.1]),
      overt: surfaceStep([-0.31, 2.25], [0.125, 1.2]),
      // The deepest of the page's color in both schemes: under a dialog's
      // backdrop, a veil of it darkens the page; it was near-white in a dark one.
      bedrock: ld(
        `oklch(8% calc(${surfaceC} * 1.2) ${neutral})`,
        `oklch(6% calc(${surfaceCDark} * 1.2) ${neutral})`,
      ),
    },
    text: {
      default: text([20, 2], [88, 0.8]),
      muted: text([45, 1.5], [65, 1.2]),
      subtle: text([35, 1.8], [75, 1]),
      overt: text([10, 2.2], [95, 0.6]),
      link: shift(accent, 0.1, 0.05),
      'link-hover': shift(v('text', 'link'), -0.1, 0),
    },
    // Steps from the base, as the surfaces are: darker in a light scheme,
    // lighter in a dark one, and in the base's own hue with a little more of
    // its chroma, which a thin line needs to read as the page's color. Text mixed into the base, as they were, came out grey on a
    // tinted page: the text is near-neutral, so the mix lost the tint.
    outline: {
      subtle: inked(ld(scale(base, -0.07, 1.3), scale(base, 0.065, 1.25)), 'subtle'),
      default: inked(ld(scale(base, -0.13, 1.4), scale(base, 0.12, 1.35)), 'default'),
      overt: inked(ld(scale(base, -0.27, 1.6), scale(base, 0.23, 1.5)), 'overt'),
      // The accent as it is: darker and more saturated, the ring was the
      // harshest color on the page.
      focus: accent,
    },
    accent: family(
      'accent',
      ld(
        `oklch(${v('knob', 'accent-l')} ${v('knob', 'accent-c')} ${v('hue', 'accent')})`,
        `oklch(${v('knob', 'accent-l-dark')} ${v('knob', 'accent-c-dark')} ${v('hue', 'accent')})`,
      ),
    ),
    secondary: family('secondary', rehue(accent, v('hue', 'secondary'))),
    tertiary: family('tertiary', rehue(accent, v('hue', 'tertiary'))),
    // A near-black of the shadow's hue: faint on a light surface, and denser
    // on a dark one, where a light shadow would read as a glow.
    shadow: {
      color: ld(
        `oklch(25% ${v('knob', 'shadow-c')} ${v('knob', 'shadow-h')} / 0.14)`,
        // A third more chroma, as the dark surfaces have.
        `oklch(5% calc(${v('knob', 'shadow-c')} * 4 / 3) ${v('knob', 'shadow-h')} / 0.6)`,
      ),
    },
    // What a state lays over the surface under it, after Fluid Functionalism's
    // overlays. `hover`, `tint` and `tint-hover` mix the element's own text
    // color: `currentColor` resolves where the film is drawn, so a hover reads
    // at any elevation, on a tinted band, and on an inverted panel alike. A
    // film that must take its surface's hue instead reads a property on the
    // element (`unfilledHover` reads a surface's `--_fk-state-ink`, falling
    // back to this `ink`): a `var()` substitutes where the token is declared,
    // so a token cannot carry a per-surface ink. `tint` is a see-through fill, which
    // takes on whatever it sits on (lighter when hovered, as Fluid's: the
    // press is what darkens). `edge` is a hairline inside an image, so a pale
    // edge keeps its shape. `ink` is the state ink where no surface set one:
    // the text (`surface`), the accent's ink (`accent`), or the text with the
    // films reading it directly (`neutral`, as before).
    state: {
      hover: `color-mix(in oklab, currentColor ${v('knob', 'state-hover')}, transparent)`,
      tint: ld(
        `color-mix(in oklab, currentColor ${v('knob', 'state-tint')}, transparent)`,
        `color-mix(in oklab, currentColor ${v('knob', 'state-tint-dark')}, transparent)`,
      ),
      'tint-hover': ld(
        `color-mix(in oklab, currentColor calc(${v('knob', 'state-tint')} * 0.8), transparent)`,
        `color-mix(in oklab, currentColor calc(${v('knob', 'state-tint-dark')} * 0.8), transparent)`,
      ),
      edge: `color-mix(in oklab, ${v('text', 'overt')} ${v('knob', 'image-edge')}, transparent)`,
      ink: v('knob', 'state-ink'),
    },
    // A menu's panel and its lit row, which the popup recipes read.
    popup: {
      surface: `color-mix(in oklab, ${share(
        ld(
          `oklch(${v('knob', 'base-l-dark')} calc(${surfaceCDark} * 0.9) ${neutral})`,
          `oklch(${v('knob', 'base-l')} calc(${surfaceC} * 0.9) ${neutral})`,
        ),
        'popup-invert',
        base,
      )} calc(${v('knob', 'popup-alpha')} * 100%), transparent)`,
      // The other scheme's base, which an inverted panel takes wherever it is raised to.
      inverted: ld(
        `oklch(${v('knob', 'base-l-dark')} calc(${surfaceCDark} * 0.9) ${neutral})`,
        `oklch(${v('knob', 'base-l')} calc(${surfaceC} * 0.9) ${neutral})`,
      ),
      // The text of the opposite scheme: light on an inverted panel in a light one.
      ink: share(text([88, 0.8], [20, 2]), 'popup-invert', v('text', 'default')),
      highlight: share(
        v('accent', 'default'),
        'popup-bold',
        `color-mix(in oklab, ${v('popup', 'ink')} 8%, transparent)`,
      ),
      'highlight-ink': share(v('accent', 'on-fill'), 'popup-bold', v('popup', 'ink')),
      blur: v('knob', 'popup-blur'),
    },
    success: feedback('success', 55, 0.15, 64),
    warning: feedback('warning', 70, 0.15, 76),
    // Under 65% in the dark, where the text on a fill turns dark: on red that reads muddy.
    error: feedback('error', 60, 0.2, 64),
    info: feedback('info', 65, 0.15, 70),
    // Series colors, `chart-1` to `chart-5` as shadcn names them: a chart
    // assigns them in order, never by rank, so a series keeps its color.
    chart: {
      '1': chartInk(0, [0.575, 0.163], [0.622, 0.161]),
      '2': chartInk(145, [0.671, 0.175], [0.622, 0.173]),
      '3': chartInk(-93, [0.669, 0.141], [0.621, 0.128]),
      '4': chartInk(180, [0.764, 0.161], [0.67, 0.143]),
      '5': chartInk(102, [0.716, 0.141], [0.622, 0.171]),
    },
    // Color scales of ten even steps, for what is not a role: a tag's
    // color, an illustration, a status of the application's own.
    red: colorScale('red'),
    orange: colorScale('orange'),
    yellow: colorScale('yellow'),
    green: colorScale('green'),
    teal: colorScale('teal'),
    blue: colorScale('blue'),
    purple: colorScale('purple'),
    // Code, by the kinds a tokenizer names (`syntax-keyword` is
    // `--fk-syntax-keyword`): each kind in a hue the palette already has, so
    // code follows the brand, and the quiet kinds in the text's own grey.
    syntax: {
      keyword: syntaxInk(v('hue', 'accent')),
      function: syntaxInk(v('hue', 'secondary')),
      type: syntaxInk(v('hue', 'tertiary')),
      string: syntaxInk(v('knob', 'success-h')),
      number: syntaxInk(v('knob', 'warning-h')),
      property: syntaxInk(v('knob', 'info-h')),
      operator: v('text', 'default'),
      punctuation: v('text', 'muted'),
      comment: text([52, 1], [62, 1]),
    },
  })
}

export type OklchTheme = ReturnType<typeof oklch>
