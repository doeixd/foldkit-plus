/**
 * The shipped theme's text reads at WCAG AA (4.5:1) in both schemes. The
 * browser resolves the palette, and a canvas turns each color into the sRGB
 * WCAG measures, so a default that moves a surface or the accent too far
 * fails here.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme } from '../src/theme.js'

const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const install = (scheme: 'light' | 'dark') => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('theme', Theme.root(Theme.standard(), { colorScheme: scheme })),
  )
  document.head.append(style)
}

const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!

/** A token as sRGB channels, 0 to 255, as the browser paints it. */
const rgbOf = (token: string): readonly [number, number, number] => {
  const swatch = document.createElement('div')
  swatch.style.color = `var(--fk-${token})`
  document.body.append(swatch)
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = getComputedStyle(swatch).color
  canvas.fillRect(0, 0, 1, 1)
  const [red, green, blue] = canvas.getImageData(0, 0, 1, 1).data
  return [red!, green!, blue!]
}

const luminanceOf = (rgb: readonly [number, number, number]) => {
  const [red, green, blue] = rgb.map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

const contrastOf = (text: string, ground: string) => {
  const [a, b] = [luminanceOf(rgbOf(text)), luminanceOf(rgbOf(ground))]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Text and the ground it sits on, each at AA's 4.5:1. */
const pairs = [
  ['text-default', 'surface-base'],
  ['text-muted', 'surface-base'],
  ['text-default', 'surface-muted'],
  ['text-muted', 'surface-muted'],
  ['text-link', 'surface-base'],
  ['accent-ink', 'surface-base'],
  ['accent-ink', 'surface-muted'],
] as const

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the default theme’s text reads at AA',
  scheme => {
    install(scheme)
    for (const [text, ground] of pairs)
      expect(contrastOf(text, ground), `${text} on ${ground}`).toBeGreaterThanOrEqual(4.5)
  },
)

// A label on the accent's fill meets 3:1, AA for large text and for a
// control's edge, not 4.5:1: the accent's lightness of 55 is #255's choice,
// and white on it reads 3.9:1.
test.each(['light', 'dark'] as const)(
  'in a %s scheme, a label on the accent reads at 3:1',
  scheme => {
    install(scheme)
    expect(contrastOf('accent-on-fill', 'accent-default')).toBeGreaterThanOrEqual(3)
  },
)
