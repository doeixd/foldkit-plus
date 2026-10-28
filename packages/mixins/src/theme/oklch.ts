/**
 * A whole palette from a few knobs, as css-tags derives it: every value
 * except the knobs is a CSS expression over other tokens, so overriding a
 * knob on the element that declares the tokens (`:root`, or a scoped theme's
 * selector) re-derives the rest in the browser. A custom property resolves
 * where it is declared, so a knob overridden on a subtree below `:root`
 * changes nothing: `Theme.scope` declares the derivations there too. Where
 * light and dark schemes need different numbers the value is a `light-dark()` pair, so one theme serves both and a user's
 * choice is a `color-scheme` override.
 */
import { define } from './core.js'
import { boundaryVariables, chartHue, fit, gamut, hue, type Hue } from './gamut.js'
import { standard, unsetOf } from './knobs.js'

const v = (group: string, name: string) => `var(--fk-${group}-${name})`
const ld = (light: string, dark: string) => `light-dark(${light}, ${dark})`
/** Each half of a `light-dark()` pair fitted into sRGB on `hue`. */
const fitted = (hue: Hue, light: string, dark: string) => ld(fit(light, hue), fit(dark, hue))
const offset = (amount: number) => `${amount < 0 ? '-' : '+'} ${Math.abs(amount)}`
/** `oklch(from <color> …)` with the hue kept. */
const from = (color: string, l: string, c: string) => `oklch(from ${color} ${l} ${c} h)`
const shift = (color: string, dl: number, dc: number) =>
  from(color, `calc(l ${offset(dl)})`, `calc(c ${offset(dc)})`)
const scale = (color: string, dl: number, cx: number) =>
  from(color, `calc(l ${offset(dl)})`, `calc(c * ${cx})`)
/** Near-black or near-white text over `color`. */
const contrast = (color: string, hue: Hue) =>
  fit(`oklch(from ${color} clamp(0.1, (0.65 / l - 1) * 999, 0.98) min(c, 0.08) h)`, hue)
/**
 * `color` as text on the base surface: dark in a light scheme, light in a
 * dark one. 0.45 reads at WCAG AA on the muted surface too, where 0.5 fell
 * short (4.1:1) once the default surfaces stood further apart.
 */
const ink = (color: string, hue: Hue) =>
  fitted(hue, from(color, '0.45', 'c'), from(color, '0.8', 'c'))
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
 * How far a step's target lies past the offset it names: at a contrast of
 * 26% (the default until #255) a step sits where its offset says, and the whole knob spans
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
  return fit(`color-mix(in oklch, ${base} calc(100% - ${amount}), ${target} ${amount})`, 'neutral')
}

/** `a` where the 0-or-1 knob `name` is 1, `b` where it is 0. */
const share = (a: string, name: string, b: string) =>
  `color-mix(in oklab, ${a} calc(${v('knob', name)} * 100%), ${b})`

/** A text color: fixed lightness, chroma scaled by surface saturation and the contrast factor. */
const text = (light: Step, dark: Step) =>
  fitted(
    'neutral',
    `oklch(${light[0]}% calc(${surfaceC} * ${light[1]} * ${contrastFactor}) ${neutral})`,
    `oklch(${dark[0]}% calc(${surfaceCDark} * ${dark[1]} * ${contrastFactor}) ${neutral})`,
  )

/**
 * A color family, every one the same shape: its fill, the fill hovered and
 * pressed, a tint of it on the base, a line in it that stands off the base
 * (darker in a light scheme, lighter in a dark one), and text on the fill
 * and in the family's color.
 */
const family = (name: Hue, defaultValue: string) => {
  const color = v(name, 'default')
  return {
    default: defaultValue,
    hover: fit(shift(color, -0.06, 0), name),
    active: fit(shift(color, -0.1, 0.05), name),
    // A mix of two colors inside sRGB can bend out of it, toward white most.
    subtle: fit(tint(color, 85), name),
    outline: fitted(name, shift(color, -0.05, 0), shift(color, 0.05, 0)),
    'on-fill': contrast(color, name),
    ink: ink(color, name),
  }
}

/**
 * A code color in `hue`: the same lightness for every kind, so no kind shouts,
 * dark enough to read on a light surface and light enough on a dark one.
 */
const syntaxInk = (name: Hue, hue: string) =>
  fitted(
    name,
    `oklch(48% ${v('knob', 'syntax-c')} ${hue})`,
    `oklch(80% ${v('knob', 'syntax-c')} ${hue})`,
  )

/**
 * A chart's series color: a hue a fixed turn from the first, at a lightness
 * and chroma chosen for that hue in each scheme (a yellow sits lighter than a
 * blue to read as strong). The five are the dataviz reference palette's first
 * slots, in its order, which keeps neighbors apart under protan and deutan
 * vision; moving `chart-h` turns them all and keeps the order.
 */
const chartInk = (index: 1 | 2 | 3 | 4 | 5, light: Step, dark: Step) => {
  const hue = chartHue(index)
  return fitted(
    `chart-${index}`,
    `oklch(${light[0]} ${light[1]} ${hue})`,
    `oklch(${dark[0]} ${dark[1]} ${hue})`,
  )
}

/** A feedback family, lighter in a dark scheme so its fill reads on a dark page. */
const feedback = (
  name: 'success' | 'warning' | 'error' | 'info',
  l: number,
  c: number,
  dark: number,
) =>
  family(
    name,
    fitted(
      name,
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
    fit(`oklch(${scaleL[index]}% calc(${scaleC[index]} * ${v('knob', 'scale-c')}) ${hue})`, name)
  const wash = (share: number) =>
    fit(`color-mix(in oklab, ${v(name, '6')} ${share}%, ${v('surface', 'base')})`, name)
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

const accent = v('accent', 'default')

/**
 * The accent's knobs on `hue`, before fitting into sRGB: the secondary and
 * tertiary turn this, not the fitted accent, so each keeps what its own hue
 * can show.
 */
const accentOn = (hue: string) =>
  ld(
    `oklch(${v('knob', 'accent-l')} ${v('knob', 'accent-c')} ${hue})`,
    `oklch(${v('knob', 'accent-l-dark')} ${v('knob', 'accent-c-dark')} ${hue})`,
  )

/**
 * The palette: every color a CSS expression over the knobs' variables. The
 * knobs stand at their defaults here; a theme declares its own values over
 * them (`Theme.standard`).
 */
export const palette = define({
  knob: {
    ...unsetOf(standard),
    ...boundaryVariables(unsetOf(standard)),
    // How much of the text a state lays over its surface; a hover's is a knob.
    'state-tint': '8%',
    'state-tint-dark': '25%',
    'image-edge': '10%',
    // How much lighter each raised level is in a dark scheme.
    'raise-dark': '0.027',
  },
  hue,
  // Each hue's sRGB boundary, which every color derived on it is fitted to.
  gamut,
  surface: {
    base: fitted(
      'neutral',
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
    bedrock: fitted(
      'neutral',
      `oklch(8% calc(${surfaceC} * 1.2) ${neutral})`,
      `oklch(6% calc(${surfaceCDark} * 1.2) ${neutral})`,
    ),
  },
  text: {
    default: text([20, 2], [88, 0.8]),
    muted: text([45, 1.5], [65, 1.2]),
    subtle: text([35, 1.8], [75, 1]),
    overt: text([10, 2.2], [95, 0.6]),
    // The accent's ink: a link lighter than the accent read at 2.9:1 on a white page.
    link: v('accent', 'ink'),
    'link-hover': fit(shift(v('text', 'link'), -0.1, 0), 'accent'),
  },
  // Steps from the base, as the surfaces are: darker in a light scheme,
  // lighter in a dark one, and in the base's own hue with a little more of
  // its chroma, which a thin line needs to read as the page's color. Text mixed into the base, as they were, came out grey on a
  // tinted page: the text is near-neutral, so the mix lost the tint.
  outline: {
    subtle: inked(fitted('neutral', scale(base, -0.07, 1.3), scale(base, 0.065, 1.25)), 'subtle'),
    // Between two parts of one surface (groups of a list, a panel's
    // header): a step past `subtle`, which a dark page all but hides.
    divider: inked(fitted('neutral', scale(base, -0.1, 1.35), scale(base, 0.095, 1.3)), 'subtle'),
    default: inked(fitted('neutral', scale(base, -0.13, 1.4), scale(base, 0.12, 1.35)), 'default'),
    overt: inked(fitted('neutral', scale(base, -0.27, 1.6), scale(base, 0.23, 1.5)), 'overt'),
    // The accent as it is: darker and more saturated, the ring was the
    // harshest color on the page.
    focus: accent,
  },
  accent: family('accent', fit(accentOn(v('hue', 'accent')), 'accent')),
  secondary: family('secondary', fit(accentOn(v('hue', 'secondary')), 'secondary')),
  tertiary: family('tertiary', fit(accentOn(v('hue', 'tertiary')), 'tertiary')),
  // A near-black of the shadow's hue: faint on a light surface, and denser
  // on a dark one, where a light shadow would read as a glow.
  shadow: {
    color: fitted(
      'shadow',
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
    // The same ink held down: a press is the hover at 1.75, one strength the
    // `hoverStrength` knob moves for both. `pressedHover` is its twin, and
    // takes the surface's ink where this one takes the text's.
    press: `color-mix(in oklab, currentColor calc(${v('knob', 'state-hover')} * 1.75), transparent)`,
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
      fitted(
        'neutral',
        `oklch(${v('knob', 'base-l-dark')} calc(${surfaceCDark} * 0.9) ${neutral})`,
        `oklch(${v('knob', 'base-l')} calc(${surfaceC} * 0.9) ${neutral})`,
      ),
      'popup-invert',
      base,
    )} calc(${v('knob', 'popup-alpha')} * 100%), transparent)`,
    // The other scheme's base, which an inverted panel takes wherever it is raised to.
    inverted: fitted(
      'neutral',
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
    // Held down, as a row's hover deepens to its press: the accent darker, the
    // panel's own ink denser.
    press: share(
      v('accent', 'active'),
      'popup-bold',
      `color-mix(in oklab, ${v('popup', 'ink')} 14%, transparent)`,
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
    '1': chartInk(1, [0.575, 0.163], [0.622, 0.161]),
    '2': chartInk(2, [0.671, 0.175], [0.622, 0.173]),
    '3': chartInk(3, [0.669, 0.141], [0.621, 0.128]),
    '4': chartInk(4, [0.764, 0.161], [0.67, 0.143]),
    '5': chartInk(5, [0.716, 0.141], [0.622, 0.171]),
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
    keyword: syntaxInk('accent', v('hue', 'accent')),
    function: syntaxInk('secondary', v('hue', 'secondary')),
    type: syntaxInk('tertiary', v('hue', 'tertiary')),
    string: syntaxInk('success', v('knob', 'success-h')),
    number: syntaxInk('warning', v('knob', 'warning-h')),
    property: syntaxInk('info', v('knob', 'info-h')),
    operator: v('text', 'default'),
    punctuation: v('text', 'muted'),
    comment: text([52, 1], [62, 1]),
  },
})

export type Palette = typeof palette
