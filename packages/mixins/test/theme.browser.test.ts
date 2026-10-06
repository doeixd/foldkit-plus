/**
 * A theme's tints in a real browser, which does the color math: a tone's
 * `subtle` keeps the tone's hue over a tinted base. Mixed in OKLCH, a mix
 * mostly of a blue-grey base took the base's hue, so a success tint was blue.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme } from '../src/theme.js'

const theme = Theme.compose(
  Theme.tokens,
  // A base tinted toward the accent's blue, as the CMS's is: a mix in OKLCH
  // took its hue (about 248°) whatever the tone.
  Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' }, surfaceSaturation: 0.008 }),
)
const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** The hue of a computed color, in degrees: from OKLCH's `h`, or OKLab's `a` and `b`. */
const hueOf = (color: string): number => {
  const lch = /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+([\d.]+)/.exec(color)
  if (lch !== null) return Number(lch[1])
  const lab = /^oklab\(\s*[\d.]+%?\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(color)
  if (lab === null) throw new Error(`not an OKLab or OKLCH color: ${color}`)
  return ((Math.atan2(Number(lab[2]), Number(lab[1])) * 180) / Math.PI + 360) % 360
}
/** The chroma of a computed color: OKLCH's `c`, or the length of OKLab's `a` and `b`. */
const chromaOf = (color: string): number => {
  const lch = /^oklch\(\s*[\d.]+%?\s+([\d.]+)/.exec(color)
  if (lch !== null) return Number(lch[1])
  const lab = /^oklab\(\s*[\d.]+%?\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(color)
  if (lab === null) throw new Error(`not an OKLab or OKLCH color: ${color}`)
  return Math.hypot(Number(lab[1]), Number(lab[2]))
}
const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

/** The page's tokens in one scheme, installed. */
const install = (scheme: 'light' | 'dark') => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('tokens', Theme.root(Theme.tokens, { colorScheme: scheme })),
    L.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: scheme })),
  )
  document.head.append(style)
}
/** A token as the browser computes it, as a background. */
const computed = (token: string) => {
  const swatch = document.createElement('div')
  swatch.style.background = `var(--fk-${token})`
  document.body.append(swatch)
  return getComputedStyle(swatch).backgroundColor
}
const lightnessOf = (color: string) => Number(/^okl(?:ab|ch)\(\s*([\d.]+)/.exec(color)![1])

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the surface steps keep the base’s tint',
  scheme => {
    install(scheme)
    const base = computed('surface-base')
    for (const step of ['surface-muted', 'surface-subtle', 'surface-default'].map(computed)) {
      expect(distance(hueOf(step), hueOf(base)), step).toBeLessThan(10)
      // About the base's chroma: less reads grey on the page, more reads as
      // another, bluer color beside it (a sidebar against the page).
      expect(chromaOf(step) / chromaOf(base), step).toBeGreaterThan(0.9)
      expect(chromaOf(step) / chromaOf(base), step).toBeLessThan(1.35)
    }
  },
)

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the outlines keep the base’s tint and step away from it',
  scheme => {
    install(scheme)
    const base = computed('surface-base')
    const lines = ['outline-subtle', 'outline-default', 'outline-overt'].map(computed)
    for (const line of lines) {
      expect(distance(hueOf(line), hueOf(base)), line).toBeLessThan(10)
      // A little more of the tint than the base, which a thin line needs to
      // read as the page's color; not so much it reads as another one.
      expect(chromaOf(line) / chromaOf(base), line).toBeGreaterThan(1.1)
      expect(chromaOf(line) / chromaOf(base), line).toBeLessThan(1.7)
    }
    const steps = lines.map(line => Math.abs(lightnessOf(line) - lightnessOf(base)))
    expect(steps[0]).toBeGreaterThan(0.04)
    expect(steps).toEqual([...steps].sort((a, b) => a - b))
  },
)

test.each([
  ['success', 145],
  ['warning', 75],
  ['error', 25],
])('the %s tint keeps its hue over a tinted base', (tone, hue) => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
    L.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: 'light' })),
  )
  document.head.append(style)
  const swatch = document.createElement('div')
  swatch.style.background = `var(--fk-${tone}-subtle)`
  document.body.append(swatch)
  const color = getComputedStyle(swatch).backgroundColor
  expect(distance(hueOf(color), hue), color).toBeLessThan(20)
})

const families = ['accent', 'secondary', 'tertiary', 'success', 'warning', 'error', 'info']

test.each(['light', 'dark'] as const)(
  'in a %s scheme, every family is one shape, with a line that stands off the base',
  scheme => {
    install(scheme)
    const base = lightnessOf(computed('surface-base'))
    for (const family of families) {
      for (const member of ['default', 'hover', 'active', 'subtle', 'outline', 'on-fill', 'ink'])
        expect(computed(`${family}-${member}`), `${family}-${member}`).not.toBe('rgba(0, 0, 0, 0)')
      // Toward the side away from the page: darker on a light page, lighter on a dark one.
      const fill = lightnessOf(computed(`${family}-default`))
      const line = lightnessOf(computed(`${family}-outline`))
      expect(Math.abs(line - base), family).toBeGreaterThan(Math.abs(fill - base))
    }
  },
)

test('a feedback fill is lighter in a dark scheme, so it reads on a dark page', () => {
  install('light')
  const light = families.slice(3).map(family => lightnessOf(computed(`${family}-default`)))
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  install('dark')
  const dark = families.slice(3).map(family => lightnessOf(computed(`${family}-default`)))
  dark.forEach((value, index) => expect(value).toBeGreaterThan(light[index] ?? 1))
})

test.each(['light', 'dark'] as const)(
  'in a %s scheme, bedrock is darker than the base, and the focus ring is the accent',
  scheme => {
    install(scheme)
    expect(lightnessOf(computed('surface-bedrock'))).toBeLessThan(
      lightnessOf(computed('surface-base')),
    )
    expect(computed('outline-focus')).toBe(computed('accent-default'))
  },
)

test('the error fill keeps light text in a dark scheme', () => {
  install('dark')
  expect(lightnessOf(computed('error-on-fill'))).toBeGreaterThan(
    lightnessOf(computed('error-default')),
  )
})
