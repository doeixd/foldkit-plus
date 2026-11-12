/**
 * The neutrals stay neutral: a surface, a text or a line paints with no more
 * chroma than the theme gives the neutrals, and on the neutral's hue. A grey's
 * hue is powerless, and engines disagree on what it reads: Chromium keeps the
 * hue a grey was written with, reads a named grey's as about 24, and others
 * read 0. A step that takes a grey's `h`, or mixes a grey in OKLCH, can carry
 * that hue into a color with chroma, a red the theme never named. So these
 * tests also hand the palette greys whose hue is red, as raw CSS might.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme, type Standard, type Values as KnobValues } from '../src/theme.js'

const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.style.cssText = ''
})

const install = (values: KnobValues<Standard>, scheme: 'light' | 'dark') => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('theme', Theme.root(Theme.standard(Theme.make(values)), { colorScheme: scheme })),
  )
  document.head.append(style)
}

const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!

const toLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4

/** A computed `oklab(…)` or `oklch(…)` color's chroma and hue. */
const readOf = (computed: string) => {
  const [space, , y = 0, z = 0] = computed
    .replace(/[(),/]/g, ' ')
    .trim()
    .split(/\s+/)
  const [first, second] = [Number(y), Number(z)]
  if (space === 'oklch') return { computed, chroma: first, hue: second }
  if (space === 'oklab')
    return {
      computed,
      chroma: Math.hypot(first, second),
      hue: ((Math.atan2(second, first) * 180) / Math.PI + 360) % 360,
    }
  throw new Error(`a see-through color the test cannot read: ${computed}`)
}

/** A token's OKLCH chroma and hue, as the browser paints it. */
const painted = (token: string) => {
  const swatch = document.createElement('div')
  swatch.style.color = `var(--fk-${token})`
  document.body.append(swatch)
  const computed = getComputedStyle(swatch).color
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = computed
  canvas.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, bl = 0, alpha = 0] = Array.from(canvas.getImageData(0, 0, 1, 1).data)
  // A see-through color's channels lose most of their bits to its alpha: read
  // its chroma and hue from the computed value instead.
  if (alpha < 255) return readOf(computed)
  const [red, green, blue] = [r, g, bl].map(channel => toLinear(channel / 255)) as [
    number,
    number,
    number,
  ]
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short
  return {
    computed,
    chroma: Math.hypot(a, b),
    hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  }
}

const turn = (from: number, to: number) => Math.abs(((to - from + 540) % 360) - 180)

/** Every token drawn from the neutrals alone. */
const neutrals = [
  ...['base', 'muted', 'subtle', 'default', 'overt', 'bedrock', 'field'].map(n => `surface-${n}`),
  ...['default', 'muted', 'subtle', 'overt'].map(n => `text-${n}`),
  ...['subtle', 'divider', 'default', 'overt'].map(n => `outline-${n}`),
  'popup-inverted',
  'popup-ink',
  'syntax-comment',
]

// Below this a painted color reads grey: an 8-bit channel's rounding alone
// moves a grey's chroma by about 0.003.
const GREY = 0.008

/**
 * The most chroma a neutral takes: the most any neutral multiplies the
 * surface knob by (an overt line 1.6, overt text 2.2, a text-contrast of 2).
 */
const ceiling = (surface: number) => surface * 2.2 * 2 + GREY

const themes: ReadonlyArray<readonly [string, KnobValues<Standard>, number, number]> = [
  ['the default', {}, 235, 0],
  ['a tinted page', { surface: { saturation: { light: 0.02, dark: 0.02 } } }, 235, 0.02],
  [
    'a tinted page on a green neutral, inked lines',
    {
      surface: { hue: 145, saturation: { light: 0.03, dark: 0.03 }, textContrast: 2 },
      shape: { outlines: 'ink' },
    },
    145,
    0.04,
  ],
  [
    'a tinted page, below white, inked lines',
    {
      surface: { saturation: { light: 0.03, dark: 0.03 }, lightness: { light: 95, dark: 20 } },
      shape: { outlines: 'ink' },
    },
    235,
    0.04,
  ],
]

const offNeutral = (hue: number, surface: number) =>
  neutrals.flatMap(token => {
    const { computed, chroma, hue: at } = painted(token)
    const wrong = chroma > ceiling(surface) || (chroma > GREY && turn(at, hue) > 12)
    return wrong ? [`${token}: ${computed}, chroma ${chroma.toFixed(3)} at ${at.toFixed(0)}`] : []
  })

for (const scheme of ['light', 'dark'] as const)
  test.each(themes)(
    `in a ${scheme} scheme, %s keeps every neutral on its hue`,
    (_, values, hue, surface) => {
      install(values, scheme)
      expect(offNeutral(hue, surface)).toEqual([])
    },
  )

/**
 * Greys whose hue is red, by every route an engine has to one: a named grey
 * (Chromium reads about 24), one through a relative color (Chromium writes
 * the hue it read), and one written with hue 0.
 */
const redGreys = (scheme: 'light' | 'dark') =>
  scheme === 'light'
    ? ['white', 'oklch(from #fafafa l c h)', 'oklch(0.98 0 0)']
    : ['#202020', 'oklch(from #202020 l c h)', 'oklch(0.25 0 0)']

for (const scheme of ['light', 'dark'] as const)
  test.each(themes)(
    `in a ${scheme} scheme, %s keeps its neutrals on their hue over a page whose grey is red`,
    (_, values, hue, surface) => {
      install(values, scheme)
      for (const grey of redGreys(scheme)) {
        document.documentElement.style.setProperty('--fk-surface-base', grey)
        expect(offNeutral(hue, surface), grey).toEqual([])
      }
    },
  )

test.each(['light', 'dark'] as const)(
  'in a %s scheme, a faint wash on a tinted page keeps the page’s hue in it',
  scheme => {
    // A wash is the page mixed with a step of its scale, and its hue lies
    // between theirs: 8% of red on a blue-grey page is a blue-grey, not a red.
    install(
      { surface: { saturation: { light: 0.03, dark: 0.03 }, lightness: { light: 95, dark: 20 } } },
      scheme,
    )
    const { hue, computed } = painted('red-wash-1')
    expect(turn(hue, 25), computed).toBeGreaterThan(60)
  },
)

for (const scheme of ['light', 'dark'] as const)
  test(`in a ${scheme} scheme, an application’s OKLCH mix of a neutral meets the neutral’s hue, not its grey’s`, () => {
    // An application may mix tokens in OKLCH, where a grey's hue is live in
    // Chromium: each neutral carries the neutral's hue, so a page whose grey
    // was red still mixes toward the accent on the accent's side of the wheel.
    install({}, scheme)
    for (const grey of redGreys(scheme)) {
      document.documentElement.style.setProperty('--fk-surface-base', grey)
      const swatch = document.createElement('div')
      swatch.style.color =
        'color-mix(in oklch, var(--fk-surface-muted) 70%, var(--fk-accent-default))'
      document.body.append(swatch)
      document.documentElement.style.setProperty('--fk-probe', getComputedStyle(swatch).color)
      const { hue, computed } = painted('probe')
      expect(turn(hue, 235), `${grey}: ${computed}`).toBeLessThan(12)
    }
  })
