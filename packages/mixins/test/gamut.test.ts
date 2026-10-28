/**
 * The palette's gamut boundary, evaluated from the text the stylesheet
 * writes: across the wheel, at every lightness, a chroma up to the knobs'
 * largest comes out inside sRGB, one already inside is kept, and a hue whose
 * boundary was written for another hue falls back to a bound for any hue.
 */
import { describe, expect, test } from 'vitest'
import { evaluate } from '../src/theme/cssMath.js'
import { anyHue, boundaryVariables, bounded, gamut, hue } from '../src/theme/gamut.js'
import { standard, unsetOf, variables, make } from '../src/theme/knobs.js'

/** Every variable the browser would hold for a page whose accent knob is at `accent`. */
const scopeOf = (knobs: Readonly<Record<string, string>>) => {
  const scope: Record<string, string> = {}
  for (const [name, value] of Object.entries(knobs)) scope[`--fk-knob-${name}`] = value
  for (const [name, value] of Object.entries(hue)) scope[`--fk-hue-${name}`] = value
  for (const [name, value] of Object.entries(gamut)) scope[`--fk-gamut-${name}`] = value
  return scope
}

const knobsAt = (accent: number) => variables(make({ accent: { hue: accent } }))

/** The bounded chroma of `oklch(l c accent)`, as the browser works it out. */
const fitted = (l: number, c: number, accent: number, knobs = knobsAt(accent)) =>
  evaluate(bounded('accent'), { ...scopeOf(knobs), l, c })

/** OKLCH as linear sRGB, unclipped. */
const linearSrgb = (l: number, c: number, h: number) => {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ]
}

/** How far a channel lies outside 0 to 1, in linear light. */
const excess = (l: number, c: number, h: number) =>
  Math.max(...linearSrgb(l, c, h).map(channel => Math.max(channel - 1, -channel)))

/** The largest in-gamut chroma at `l` and `h`, by bisection. */
const largest = (l: number, h: number) => {
  let [low, high] = [0, 0.5]
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2
    if (excess(l, middle, h) <= 0) low = middle
    else high = middle
  }
  return low
}

// Under a 255th of a channel once encoded: the curve to white overshoots a
// little where it meets yellow's cusp.
const EPSILON = 0.004
const hues = Array.from({ length: 72 }, (_, index) => index * 5 + 2.5)
const lightnesses = Array.from({ length: 49 }, (_, index) => 0.02 + index * 0.02)

describe('the gamut boundary', () => {
  test('maps the knobs’ most vivid chroma into sRGB at every hue and lightness', () => {
    let worst = 0
    for (const h of hues) {
      const knobs = knobsAt(h)
      for (const l of lightnesses) worst = Math.max(worst, excess(l, fitted(l, 0.4, h, knobs), h))
    }
    expect(worst).toBeLessThan(EPSILON)
  })

  test('keeps the hue’s most vivid color, away from yellow', () => {
    // Within 4% of the largest chroma sRGB holds (the worst beside the cyan and
    // magenta corners), except near yellow's cusp, where the curve to white is
    // short and bends, and up to a sixth is lost.
    for (const h of hues.filter(h => h < 95 || h > 125)) {
      const knobs = knobsAt(h)
      for (const l of lightnesses) {
        const most = largest(l, h)
        if (most > 0.02) expect(fitted(l, 0.4, h, knobs), `${l} ${h}`).toBeGreaterThan(most * 0.96)
      }
    }
  })

  test('keeps a chroma already inside sRGB', () => {
    expect(fitted(0.55, 0.1, 235)).toBe(0.1)
    expect(fitted(0.97, 0.01, 90)).toBe(0.01)
  })

  test('a hue overridden past its written boundary takes the bound for any hue', () => {
    // A raw override of the knob, as `Theme.scoped` writes: the boundary was for 235.
    const knobs = { ...knobsAt(235), 'accent-h': '100' }
    expect(fitted(0.9, 0.4, 100, knobs)).toBeCloseTo(
      Math.min(0.9 * anyHue.s, 0.1 / (anyHue.ua + anyHue.ub * 0.9)),
      6,
    )
    let worst = 0
    for (const h of hues)
      for (const l of lightnesses) {
        const c = Math.min(l * anyHue.s, (1 - l) / Math.max(0.001, anyHue.ua + anyHue.ub * l))
        worst = Math.max(worst, excess(l, c, h))
      }
    expect(worst).toBeLessThanOrEqual(0)
  })

  test('writes each hue’s boundary from the hue the palette derives', () => {
    const written = boundaryVariables({ ...unsetOf(standard), 'accent-h': '30', 'chart-h': '300' })
    expect(written['gamut-secondary-h']).toBe('90')
    expect(written['gamut-neutral-h']).toBe('30')
    expect(written['gamut-chart-2-h']).toBe('445')
    expect(written['gamut-shadow-h']).toBe('30')
    expect(boundaryVariables({ density: '1' })).toEqual({})
  })
})
