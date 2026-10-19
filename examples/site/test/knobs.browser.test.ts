/**
 * `/create`'s preview draws a theme by writing, over the default theme it
 * declares, only the knob variables that differ (`knobStyleOf`). Every
 * preset drawn so paints each token, the palette's and the scales', as the
 * preset's own theme declared whole does, in light and dark: the browser
 * computes both and they are compared.
 */
import { expect, test } from 'vitest'
import { Theme } from 'foldkit-mixins/theme'
import { declared, knobStyleOf, presets } from '../src/gallery/theme.js'

type Declarations = Readonly<Record<string, string>>

const declarationsOf = (tokens: Readonly<Record<string, Readonly<Record<string, string>>>>) =>
  Object.fromEntries(
    Object.entries(tokens).flatMap(([group, names]) =>
      Object.entries(names).map(([name, value]) => [`--fk-${group}-${name}`, value]),
    ),
  )

/** The browser's value for each non-knob token, read through a property that takes it. */
const paint = (declarations: Declarations, scheme: 'light' | 'dark') => {
  const host = document.createElement('div')
  host.style.colorScheme = scheme
  for (const [property, value] of Object.entries(declarations))
    host.style.setProperty(property, value)
  document.body.append(host)
  const painted: Record<string, string> = {}
  for (const token of Object.keys(declarations)) {
    if (!token.startsWith('--fk-') || token.startsWith('--fk-knob-')) continue
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
  host.remove()
  return painted
}

test.each(presets.map(preset => [preset.name, preset] as const))(
  '%s drawn by its knobs over the default paints as its own theme does',
  (_, preset) => {
    const own = declarationsOf(Theme.standard(Theme.make(preset.values)))
    for (const scheme of ['light', 'dark'] as const) {
      const { colorScheme: _, ...overrides } = knobStyleOf(preset.values, scheme)
      const drawn = paint({ ...declared, ...overrides }, scheme)
      const whole = paint(own, scheme)
      for (const [token, value] of Object.entries(whole))
        expect(drawn[token], `${scheme} ${token}`).toBe(value)
    }
  },
)
