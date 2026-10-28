/**
 * Every palette color the browser derives lies inside sRGB, across themes
 * whose knobs reach their limits, and the accent's ink paints in the hue its
 * knob names. The browser resolves each token to the color it computes,
 * before painting clips it, so a color outside sRGB shows as a channel
 * outside 0 to 1.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme, type Standard, type Values as KnobValues } from '../src/theme.js'

const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

type Values = KnobValues<Standard>

const install = (values: Values, scheme: 'light' | 'dark') => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('theme', Theme.root(Theme.standard(Theme.make(values)), { colorScheme: scheme })),
  )
  document.head.append(style)
}

/** The palette's color tokens: every group but the knobs, hues, boundaries and states. */
const colors = Object.entries(Theme.standard())
  .filter(([group]) => !['knob', 'hue', 'gamut', 'state'].includes(group))
  .flatMap(([group, names]) =>
    Object.keys(names)
      .filter(name => !(group === 'popup' && name === 'blur'))
      .map(name => `${group}-${name}`),
  )

const swatches = () =>
  colors.map(token => {
    const swatch = document.createElement('div')
    swatch.style.color = `var(--fk-${token})`
    document.body.append(swatch)
    return [token, swatch] as const
  })

const toLinear = (value: number) =>
  Math.sign(value) *
  (Math.abs(value) <= 0.04045
    ? Math.abs(value) / 12.92
    : ((Math.abs(value) + 0.055) / 1.055) ** 2.4)

const fromLab = (l: number, a: number, b: number) => {
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ]
}

/** A computed color as linear sRGB channels, unclipped. */
const linearOf = (computed: string): ReadonlyArray<number> => {
  const [space = '', ...rest] = computed
    .replace(/[(),/]/g, ' ')
    .trim()
    .split(/\s+/)
  const numbers = rest.filter(part => part !== 'srgb').map(Number)
  const [x = 0, y = 0, z = 0] = numbers
  if (space === 'oklch')
    return fromLab(x, y * Math.cos((z * Math.PI) / 180), y * Math.sin((z * Math.PI) / 180))
  if (space === 'oklab') return fromLab(x, y, z)
  if (space === 'color') return [x, y, z].map(toLinear)
  if (space === 'rgb' || space === 'rgba') return [x, y, z].map(channel => toLinear(channel / 255))
  throw new Error(`a color the test cannot read: ${computed}`)
}

const excessOf = (computed: string) =>
  Math.max(...linearOf(computed).map(channel => Math.max(channel - 1, -channel)))

/** A theme with every chroma at its top, each hue a turn from `hue`. */
const vivid = (hue: number, lightness: number): Values => ({
  accent: {
    hue,
    chroma: { light: 0.4, dark: 0.4 },
    lightness: { light: lightness, dark: lightness },
  },
  surface: { hue: (hue + 40) % 360, saturation: { light: 0.04, dark: 0.04 }, textContrast: 2 },
  shadow: { chroma: 0.1 },
  feedback: {
    success: (hue + 90) % 360,
    warning: (hue + 150) % 360,
    error: (hue + 210) % 360,
    info: (hue + 270) % 360,
  },
  code: { chroma: 0.4 },
  chart: { hue: (hue + 20) % 360 },
  scales: {
    chroma: 1.5,
    red: hue,
    orange: (hue + 50) % 360,
    yellow: (hue + 100) % 360,
    green: (hue + 150) % 360,
    teal: (hue + 200) % 360,
    blue: (hue + 250) % 360,
    purple: (hue + 300) % 360,
  },
})

// A 255th of a channel, once encoded: the curve to white meets yellow's cusp a
// little outside, and a mix of two colors inside sRGB can bend a little out.
const EPSILON = 0.004

test.each(['light', 'dark'] as const)(
  'in a %s scheme, every palette color lies inside sRGB, at every hue and accent lightness',
  scheme => {
    const drawn = swatches()
    let worst = { excess: 0, at: '' }
    for (let hue = 0; hue < 360; hue += 15)
      for (const lightness of [5, 30, 55, 80, 98]) {
        install(vivid(hue, lightness), scheme)
        for (const [token, swatch] of drawn) {
          const computed = getComputedStyle(swatch).color
          const excess = excessOf(computed)
          if (excess > worst.excess)
            worst = { excess, at: `${token} at ${hue}°, ${lightness}%: ${computed}` }
        }
      }
    expect(worst.excess, worst.at).toBeLessThan(EPSILON)
  },
)

test('a raw override of a hue knob still leaves its colors inside sRGB', () => {
  const drawn = swatches()
  install(vivid(235, 55), 'light')
  document.documentElement.style.setProperty('--fk-knob-accent-h', '110')
  let worst = 0
  for (const [, swatch] of drawn) worst = Math.max(worst, excessOf(getComputedStyle(swatch).color))
  document.documentElement.style.removeProperty('--fk-knob-accent-h')
  expect(worst).toBeLessThan(EPSILON)
})

const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!

/** A token's hue on the OKLCH wheel, as the browser paints it. */
const paintedHue = (token: string) => {
  const swatch = document.createElement('div')
  swatch.style.color = `var(--fk-${token})`
  document.body.append(swatch)
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = getComputedStyle(swatch).color
  canvas.fillRect(0, 0, 1, 1)
  const [red, green, blue] = Array.from(canvas.getImageData(0, 0, 1, 1).data).map(channel =>
    toLinear(channel / 255),
  ) as [number, number, number]
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
}

const turn = (from: number, to: number) => Math.abs(((to - from + 540) % 360) - 180)

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the accent’s ink paints in its knob’s hue',
  scheme => {
    // The default first: its ink, `oklch(0.45 0.225 235)`, painted at 257 when clipped.
    install({}, scheme)
    expect(turn(paintedHue('accent-ink'), 235)).toBeLessThan(3)
    for (const hue of [25, 145, 300]) {
      install({ accent: { hue } }, scheme)
      expect(turn(paintedHue('accent-ink'), hue), `${hue}`).toBeLessThan(3)
    }
  },
)

test('a color reads each hue’s boundary as a number, worked out once at the root', () => {
  install({}, 'light')
  const value = getComputedStyle(document.documentElement).getPropertyValue('--fk-gamut-accent-s')
  expect(value).toMatch(/^\d*\.\d+$/)
})
