/**
 * The contrast of the palette the theme derives, measured on the page rather than
 * computed from the knobs: each pair is drawn as a probe element in the colours
 * its tokens give, and the Command reads what the browser resolved them to.
 *
 * Measured on what is painted: a colour is drawn onto a one-pixel canvas, which
 * clips a colour outside sRGB the way a screen does (the default accent's ink
 * `oklch(0.45 0.225 235)` paints at another hue than the knob names), then the
 * WCAG 2 contrast ratio is taken from the painted sRGB channels.
 */
import { Option } from 'effect'

/** A foreground token and the background token it is read on, by group and name. */
export interface Pair {
  readonly label: string
  readonly foreground: readonly [group: string, name: string]
  readonly background: readonly [group: string, name: string]
}

export const pairs: ReadonlyArray<Pair> = [
  { label: 'Text', foreground: ['text', 'default'], background: ['surface', 'base'] },
  { label: 'Muted text', foreground: ['text', 'muted'], background: ['surface', 'base'] },
  { label: 'Subtle text', foreground: ['text', 'subtle'], background: ['surface', 'base'] },
  {
    label: 'Text on a muted surface',
    foreground: ['text', 'default'],
    background: ['surface', 'muted'],
  },
  { label: 'Link', foreground: ['text', 'link'], background: ['surface', 'base'] },
  { label: 'Success', foreground: ['success', 'ink'], background: ['surface', 'base'] },
  { label: 'Warning', foreground: ['warning', 'ink'], background: ['surface', 'base'] },
  { label: 'Error', foreground: ['error', 'ink'], background: ['surface', 'base'] },
  { label: 'Info', foreground: ['info', 'ink'], background: ['surface', 'base'] },
]

/** The id of the probe that draws pair `index`, which `measure` reads. */
export const probeId = (index: number): string => `contrast-probe-${index}`

export type Rgb = readonly [red: number, green: number, blue: number]

const channel = (value: number): number => {
  const unit = value / 255
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
}

/** The WCAG 2 relative luminance of an sRGB colour with channels 0 to 255. */
export const luminance = ([red, green, blue]: Rgb): number =>
  0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)

/** The WCAG 2 contrast ratio of two colours, from 1 to 21. */
export const ratio = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/** WCAG 2's levels for text: AA is 4.5, large text is 3. */
export type Grade = 'AAA' | 'AA' | 'Large' | 'Fail'

export const gradeOf = (value: number): Grade =>
  value >= 7 ? 'AAA' : value >= 4.5 ? 'AA' : value >= 3 ? 'Large' : 'Fail'

/** What a colour paints as: resolved by the browser, clipped to sRGB, read off one pixel. */
const painted = (css: string): Option.Option<Rgb> => {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) return Option.none()
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = css
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
  return red === undefined || green === undefined || blue === undefined || alpha !== 255
    ? Option.none()
    : Option.some([red, green, blue])
}

/** The ratio of each pair as the page draws it now; none for a pair that cannot be read. */
export const measure = (): ReadonlyArray<Option.Option<number>> =>
  pairs.map((_, index) => {
    const probe = document.getElementById(probeId(index))
    if (probe === null) return Option.none()
    const style = getComputedStyle(probe)
    return Option.flatMap(painted(style.color), foreground =>
      Option.map(painted(style.backgroundColor), background => ratio(foreground, background)),
    )
  })
