/**
 * Gamut mapping for the palette: a color whose chroma lies outside sRGB keeps
 * its OKLCH lightness and hue and loses chroma until it fits, as CSS Color 4's
 * gamut mapping does. A browser left to itself clips such a color channel by
 * channel instead, which moves its hue (the default accent's ink painted 20
 * degrees off its knob).
 *
 * Every palette color is a CSS expression the browser derives, so the mapping
 * is split. Where a theme's knob variables are written, `boundaryVariables`
 * works out each palette hue's sRGB boundary and writes it beside them, with
 * the hue it was worked out for. The palette's `gamut` tokens read that
 * boundary while the hue the browser derives is still that hue, and a bound
 * that holds at every hue when it is not (a knob overridden in raw CSS), so a
 * color is never left outside sRGB. `fit` reduces a color's chroma to the
 * bound at its lightness. Why not one way or the other alone:
 * `docs/design/255-default-theme-DESIGN.md`, "Gamut".
 */
import { evaluate } from './cssMath.js'

const v = (group: string, name: string) => `var(--fk-${group}-${name})`

/** The palette's derived hues, the `hue` group. */
export const hue = {
  accent: v('knob', 'accent-h'),
  secondary: `calc(${v('knob', 'accent-h')} + ${v('knob', 'secondary-shift')})`,
  tertiary: `calc(${v('knob', 'accent-h')} + ${v('knob', 'tertiary-shift')})`,
  neutral: v('knob', 'neutral-h'),
} as const

const chartTurns = [0, 145, -93, 180, 102] as const

/** The hue of chart series `index` (1 to 5): a fixed turn from `chart-h`. */
export const chartHue = (index: 1 | 2 | 3 | 4 | 5) => {
  const turn = chartTurns[index - 1]!
  return turn === 0
    ? v('knob', 'chart-h')
    : `calc(${v('knob', 'chart-h')} ${turn < 0 ? '-' : '+'} ${Math.abs(turn)})`
}

/** Every hue a palette color is drawn in, by the name its boundary goes under. */
const hues = {
  accent: v('hue', 'accent'),
  secondary: v('hue', 'secondary'),
  tertiary: v('hue', 'tertiary'),
  neutral: v('hue', 'neutral'),
  shadow: v('knob', 'shadow-h'),
  success: v('knob', 'success-h'),
  warning: v('knob', 'warning-h'),
  error: v('knob', 'error-h'),
  info: v('knob', 'info-h'),
  red: v('knob', 'red-h'),
  orange: v('knob', 'orange-h'),
  yellow: v('knob', 'yellow-h'),
  green: v('knob', 'green-h'),
  teal: v('knob', 'teal-h'),
  blue: v('knob', 'blue-h'),
  purple: v('knob', 'purple-h'),
  'chart-1': chartHue(1),
  'chart-2': chartHue(2),
  'chart-3': chartHue(3),
  'chart-4': chartHue(4),
  'chart-5': chartHue(5),
} as const

export type Hue = keyof typeof hues

/**
 * A hue's sRGB boundary, as `min(l * s, (1 - l) / (ua + ub * l))` at lightness
 * `l`. Below the hue's cusp (its most vivid color) the boundary is the line
 * from black, exactly; above, a curve from the cusp to white that takes the
 * boundary's slope at white.
 */
export interface Boundary {
  readonly s: number
  readonly ua: number
  readonly ub: number
}

/** The linear sRGB rows of OKLab's LMS, red, green and blue. */
const RGB = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
] as const

/** Ottosson's polynomial for the most saturated color, by the channel that reaches 0 first. */
const SATURATION = [
  [1.19086277, 1.76576728, 0.59662641, 0.75515197, 0.56771245],
  [0.73956515, -0.45954404, 0.08285427, 0.1254107, 0.14503204],
  [1.35733652, -0.00915799, -1.1513021, -0.50559606, 0.00692167],
] as const

const dot = (row: ReadonlyArray<number>, values: ReadonlyArray<number>) =>
  row.reduce((total, weight, index) => total + weight * values[index]!, 0)

/**
 * `degrees`' boundary. The cusp is Björn Ottosson's
 * (`https://bottosson.github.io/posts/gamutclipping/`): a polynomial guess at
 * the most saturated color, refined by one step of Halley's method.
 */
export const boundaryAt = (degrees: number): Boundary => {
  const [a, b] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)]
  const k = [
    0.3963377774 * a + 0.2158037573 * b,
    -0.1055613458 * a - 0.0638541728 * b,
    -0.0894841775 * a - 1.291485548 * b,
  ]
  const channel =
    -1.88170328 * a - 0.80936493 * b > 1 ? 0 : 1.81444104 * a - 1.19445276 * b > 1 ? 1 : 2
  const [k0, k1, k2, k3, k4] = SATURATION[channel]
  const guess = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b
  const row = RGB[channel]
  const lms = k.map(kk => 1 + guess * kk)
  const f = dot(
    row,
    lms.map(x => x ** 3),
  )
  const f1 = dot(
    row,
    lms.map((x, i) => 3 * k[i]! * x * x),
  )
  const f2 = dot(
    row,
    lms.map((x, i) => 6 * k[i]! * k[i]! * x),
  )
  const s = guess - (f * f1) / (f1 * f1 - 0.5 * f * f2)
  const cubes = k.map(kk => (1 + s * kk) ** 3)
  // The cusp's lightness: the most saturated color scaled until its largest channel is 1.
  const lc = Math.max(...RGB.map(r => dot(r, cubes))) ** (-1 / 3)
  // How fast the largest channel grows with chroma at white.
  const atWhite = Math.max(...RGB.map(r => dot(r, k)))
  const ub = atWhite / (1 - lc) - 1 / (s * lc)
  return { s, ua: atWhite - ub, ub }
}

/**
 * A bound inside sRGB at every hue, for a hue whose own boundary was not
 * written: below every hue's line from black and curve to white.
 */
export const anyHue: Boundary = { s: 0.169, ua: 6.66, ub: -4.53 }

/** A number without float noise, as a variable's value. */
const num = (value: number) => String(Number(value.toFixed(6)))

/**
 * Each palette hue's boundary, as knob variables beside `declared`, the knob
 * variables a theme writes: the hue each derives from them, and its boundary.
 * A hue `declared` cannot place (a knob set that lacks it) writes nothing.
 */
export const boundaryVariables = (
  declared: Readonly<Record<string, string>>,
): Record<string, string> => {
  const scope: Record<string, string> = {}
  for (const [name, value] of Object.entries(declared)) scope[`--fk-knob-${name}`] = value
  for (const [name, value] of Object.entries(hue)) scope[`--fk-hue-${name}`] = value
  const written: Record<string, string> = {}
  for (const [name, expression] of Object.entries(hues)) {
    let degrees: number
    try {
      degrees = evaluate(expression, scope)
    } catch {
      continue
    }
    if (!Number.isFinite(degrees)) continue
    const boundary = boundaryAt(degrees)
    written[`gamut-${name}-h`] = num(degrees)
    written[`gamut-${name}-s`] = num(boundary.s)
    written[`gamut-${name}-ua`] = num(boundary.ua)
    written[`gamut-${name}-ub`] = num(boundary.ub)
  }
  return written
}

/**
 * The palette's `gamut` group: each hue's boundary while the hue the browser
 * derives is the one it was written for, and `anyHue` otherwise (`-m` is 1
 * where they differ).
 */
export const gamut: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(hues).flatMap(([name, expression]) => {
    const written = (value: string, fallback: number) =>
      `var(--fk-knob-gamut-${name}-${value}, ${fallback})`
    const at = written('h', -1000)
    const differs = v('gamut', `${name}-m`)
    const blend = (value: keyof Boundary) =>
      `calc(${written(value, anyHue[value])} + ${differs} * (${anyHue[value]} - ${written(value, anyHue[value])}))`
    return [
      [
        `${name}-m`,
        `clamp(0, (max(${expression} - ${at}, ${at} - ${expression}) - 0.001) * 100000, 1)`,
      ],
      [`${name}-s`, blend('s')],
      [`${name}-ua`, blend('ua')],
      [`${name}-ub`, blend('ub')],
    ]
  }),
)

/** The `gamut` values a color reads, registered so each is a number worked out once. */
const registered = /-(s|ua|ub)$/

/** `@property` rules for the theme's registered gamut values. */
export const registrations = (tokens: { readonly gamut?: object }): string =>
  Object.keys(tokens.gamut ?? {})
    .filter(name => registered.test(name))
    .map(name => `@property --fk-gamut-${name}{syntax:"<number>";inherits:true;initial-value:0}`)
    .join('')

/** A relative color's chroma `c`, no more than `hue`'s boundary at its lightness `l`. */
export const bounded = (hue: Hue) => {
  const ref = (value: string) => v('gamut', `${hue}-${value}`)
  return `min(c, l * ${ref('s')}, (1 - l) / max(0.001, ${ref('ua')} + ${ref('ub')} * l))`
}

/** `color` with its chroma reduced into sRGB, keeping its lightness, hue and alpha. */
export const fit = (color: string, hue: Hue) => `oklch(from ${color} l ${bounded(hue)} h / alpha)`
