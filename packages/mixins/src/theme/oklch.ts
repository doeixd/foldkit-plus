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
/** `color` tinted onto the base surface, the same in both schemes. */
const tint = (color: string, percent: number) =>
  `color-mix(in oklch, ${v('surface', 'base')} ${percent}%, ${color})`

/** The default text color at `percent` over the base surface. */
const line = (percent: number) =>
  `color-mix(in oklch, ${v('text', 'default')} ${percent}%, ${v('surface', 'base')})`

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

const family = (name: string, defaultValue: string) => {
  const color = v(name, 'default')
  return {
    default: defaultValue,
    hover: shift(color, -0.06, 0),
    active: shift(color, -0.1, 0.05),
    subtle: tint(color, 85),
    text: contrast(color),
  }
}

const feedback = (name: string, l: number, c: number) => {
  const color = v(name, 'default')
  return {
    default: `oklch(${l}% ${c} ${v('knob', `${name}-h`)})`,
    subtle: tint(color, 85),
    text: contrast(color),
    outline: shift(color, -0.05, 0),
  }
}

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
      muted: surfaceStep([-0.04, 0.8], [-0.03, 0.5]),
      subtle: surfaceStep([-0.025, 1.05], [-0.015, 0.7]),
      default: surfaceStep([-0.055, 1.2], [0.045, 1]),
      overt: surfaceStep([-0.31, 2.25], [0.125, 1.2]),
      bedrock: ld(
        `oklch(8% calc(${surfaceC} * 1.2) ${neutral})`,
        `oklch(98% calc(${surfaceCDark} * 0.7) ${neutral})`,
      ),
    },
    text: {
      default: text([20, 2], [88, 0.8]),
      muted: text([45, 1.5], [65, 1.2]),
      subtle: text([35, 1.8], [75, 1]),
      overt: text([10, 2.2], [95, 0.6]),
      'on-accent': contrast(accent),
      link: shift(accent, 0.1, 0.05),
      'link-hover': shift(v('text', 'link'), -0.1, 0),
    },
    // Text mixed into the base: darker than the surface in a light scheme,
    // lighter in a dark one, so a line separates in both from one expression.
    outline: {
      subtle: line(10),
      default: line(18),
      overt: line(35),
      focus: shift(accent, -0.1, 0.1),
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
    success: feedback('success', 55, 0.15),
    warning: feedback('warning', 70, 0.15),
    error: feedback('error', 60, 0.2),
    info: feedback('info', 65, 0.15),
  })
}

export type OklchTheme = ReturnType<typeof oklch>
