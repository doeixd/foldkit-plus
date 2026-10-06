/**
 * A whole palette from a few knobs, as css-tags derives it: every value
 * except the knobs is a CSS expression over other tokens, so overriding a
 * knob anywhere (a scoped theme, a subtree, an inline style) re-derives the
 * rest in the browser. Where light and dark schemes need different numbers
 * the value is a `light-dark()` pair, so one theme serves both and a user's
 * choice is a `color-scheme` override.
 */
import { define } from './core.js'

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
  /** Chroma of neutral surfaces; 0 is gray. */
  readonly surfaceSaturation?: number
  /** How far apart the surface steps are, 0–100%. */
  readonly surfaceContrast?: string
  /** Multiplies text chroma. */
  readonly contrastFactor?: number
  /** Hues of the feedback families. */
  readonly feedback?: {
    readonly success?: number
    readonly warning?: number
    readonly error?: number
    readonly info?: number
  }
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

/** A surface step: the base mixed toward a target by `surface-contrast`. */
const surfaceStep = (light: Step, dark: Step) => {
  const amount = v('knob', 'surface-contrast')
  const target = ld(scale(base, light[0], light[1]), scale(base, dark[0], dark[1]))
  return `color-mix(in oklch, ${base} calc(100% - ${amount}), ${target} ${amount})`
}

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

/** A feedback family, lighter in a dark scheme so its fill reads on a dark page. */
const feedback = (name: string, l: number, c: number, dark: number) =>
  family(
    name,
    ld(
      `oklch(${l}% ${c} ${v('knob', `${name}-h`)})`,
      `oklch(${dark}% ${c} ${v('knob', `${name}-h`)})`,
    ),
  )

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
      'secondary-shift': String(knobs.secondaryHueShift ?? 60),
      'tertiary-shift': String(knobs.tertiaryHueShift ?? -90),
      'surface-c': String(surfaceSaturation),
      'surface-c-dark': num(surfaceSaturation * (4 / 3)),
      'surface-contrast': knobs.surfaceContrast ?? '65%',
      'contrast-factor': String(knobs.contrastFactor ?? 1),
      'base-l': '97.5%',
      'base-l-dark': '22%',
      'success-h': String(knobs.feedback?.success ?? 145),
      'warning-h': String(knobs.feedback?.warning ?? 75),
      'error-h': String(knobs.feedback?.error ?? 25),
      'info-h': String(knobs.feedback?.info ?? 245),
    },
    hue: {
      accent: v('knob', 'accent-h'),
      secondary: `calc(${v('knob', 'accent-h')} + ${v('knob', 'secondary-shift')})`,
      tertiary: `calc(${v('knob', 'accent-h')} + ${v('knob', 'tertiary-shift')})`,
      neutral: v('hue', 'accent'),
    },
    surface: {
      base: ld(
        `oklch(${v('knob', 'base-l')} calc(${surfaceC} * 0.9) ${neutral})`,
        `oklch(${v('knob', 'base-l-dark')} calc(${surfaceCDark} * 0.9) ${neutral})`,
      ),
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
      subtle: ld(scale(base, -0.07, 1.3), scale(base, 0.065, 1.25)),
      default: ld(scale(base, -0.13, 1.4), scale(base, 0.12, 1.35)),
      overt: ld(scale(base, -0.27, 1.6), scale(base, 0.23, 1.5)),
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
    // A near-black of the neutral hue: faint on a light surface, and denser
    // on a dark one, where a light shadow would read as a glow.
    shadow: {
      color: ld(
        `oklch(25% calc(${surfaceC} * 2) ${neutral} / 0.14)`,
        `oklch(5% calc(${surfaceCDark} * 2) ${neutral} / 0.6)`,
      ),
    },
    success: feedback('success', 55, 0.15, 64),
    warning: feedback('warning', 70, 0.15, 76),
    // Under 65% in the dark, where the text on a fill turns dark: on red that reads muddy.
    error: feedback('error', 60, 0.2, 64),
    info: feedback('info', 65, 0.15, 70),
  })
}

export type OklchTheme = ReturnType<typeof oklch>
