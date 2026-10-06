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
const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

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
