/**
 * Every `/create` preset drawn as a theme of typed knobs paints what the
 * preset's own theme paints: each token, the palette's and the scales', is
 * computed by the browser from both and compared, so moving a preset onto
 * `Theme.make` changes nothing a page draws.
 */
import { expect, test } from 'vitest'
import { Theme } from 'foldkit-mixins/theme'
import { presetKnobs, presets, themeOf, valuesOf } from '../src/gallery/theme.js'

type Tokens = Readonly<Record<string, Readonly<Record<string, string>>>>

/** The browser's value for each token of `theme`, read through a property that takes it. */
const paint = (theme: Tokens, scheme: 'light' | 'dark') => {
  const host = document.createElement('div')
  host.style.colorScheme = scheme
  for (const [group, names] of Object.entries(theme))
    for (const [name, value] of Object.entries(names))
      host.style.setProperty(`--fk-${group}-${name}`, value)
  document.body.append(host)
  const painted: Record<string, string> = {}
  for (const [group, names] of Object.entries(theme)) {
    if (group === 'knob') continue
    for (const name of Object.keys(names)) {
      const token = `--fk-${group}-${name}`
      const probe = document.createElement('div')
      host.append(probe)
      const resolved = getComputedStyle(probe).getPropertyValue(token).trim()
      const property = [
        'color',
        'box-shadow',
        'width',
        'font-family',
        'transition-timing-function',
        'letter-spacing',
        'font-weight',
      ].find(each => CSS.supports(each, resolved))
      if (property === undefined) painted[token] = resolved
      else {
        probe.style.setProperty(property, `var(${token})`)
        painted[token] = getComputedStyle(probe).getPropertyValue(property)
      }
      probe.remove()
    }
  }
  host.remove()
  return painted
}

const palette = Theme.oklch({ accent: { h: 264, c: 0.17, l: '52%' } })

/**
 * Whether two painted values are the same but for float noise: their words
 * equal and their numbers within 0.0005 (the old palette rounded some to four
 * places in JavaScript, which the knobs keep exact in CSS).
 */
const same = (a: string, b: string) => {
  const parts = (value: string) => value.split(/(-?\d*\.?\d+(?:e-?\d+)?)/)
  const [left, right] = [parts(a), parts(b)]
  return (
    left.length === right.length &&
    left.every((part, index) =>
      index % 2 === 0
        ? part === right[index]
        : Math.abs(Number(part) - Number(right[index])) < 0.0005,
    )
  )
}

test.each(presets.map(preset => [preset.name, preset] as const))(
  '%s: a theme of typed knobs paints what the preset’s own theme paints',
  (_, preset) => {
    const knobs = presetKnobs(preset, 'ltr')
    const before = themeOf(knobs)
    const after = Theme.compose(
      Theme.compose(Theme.tokens, palette),
      Theme.tokensOf(Theme.make(valuesOf(knobs))),
    )
    for (const scheme of ['light', 'dark'] as const) {
      const old = paint(before, scheme)
      const fresh = paint(after, scheme)
      for (const [token, value] of Object.entries(old))
        expect(
          same(fresh[token] ?? '', value),
          `${scheme} ${token}: ${fresh[token]} for ${value}`,
        ).toBe(true)
    }
  },
)
