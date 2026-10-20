/**
 * A preview declares the default theme in its layered rule, and the reader's
 * knobs that differ are one unlayered rule over every preview (`keepKnobs`).
 * Every preset drawn so paints each token, the palette's and the scales', as
 * the preset's own theme declared whole does, in light and dark: the browser
 * computes both and they are compared. The default keeps no rule.
 */
import { Effect } from 'effect'
import { afterEach, expect, test } from 'vitest'
import { Theme } from 'foldkit-mixins/theme'
import { declared, defaults, keepKnobs, knobsPlace, presets } from '../src/gallery/theme.js'

type Declarations = Readonly<Record<string, string>>

const declarationsOf = (tokens: Readonly<Record<string, Readonly<Record<string, string>>>>) =>
  Object.fromEntries(
    Object.entries(tokens).flatMap(([group, names]) =>
      Object.entries(names).map(([name, value]) => [`--fk-${group}-${name}`, value]),
    ),
  )

afterEach(() => {
  document.head.querySelectorAll('style').forEach(element => element.remove())
  localStorage.clear()
})

/** The default theme on every preview, in a layer, as the site's stylesheet declares it. */
const declareDefault = () => {
  const sheet = document.createElement('style')
  sheet.textContent = `@layer app{[data-size]{${Object.entries(declared)
    .map(([property, value]) => `${property}:${value}`)
    .join(';')}}}`
  document.head.append(sheet)
}

/** The browser's value for each non-knob token, read through a property that takes it. */
const paint = (declarations: Declarations, scheme: 'light' | 'dark', frame = false) => {
  const host = document.createElement('div')
  host.style.colorScheme = scheme
  if (frame) host.dataset['size'] = 'page'
  else
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
    declareDefault()
    Effect.runSync(keepKnobs(preset.values))
    for (const scheme of ['light', 'dark'] as const) {
      const drawn = paint(declared, scheme, true)
      const whole = paint(own, scheme)
      for (const [token, value] of Object.entries(whole))
        expect(drawn[token], `${scheme} ${token}`).toBe(value)
    }
  },
)

test('the default theme keeps nothing, and draws as the default', () => {
  declareDefault()
  Effect.runSync(keepKnobs(presets[1]!.values))
  expect(localStorage.getItem(knobsPlace.key)).not.toBeNull()
  Effect.runSync(keepKnobs(defaults))
  expect(localStorage.getItem(knobsPlace.key)).toBeNull()
  const rule = document.head.querySelector('style[data-fk-knobs]')!.textContent
  expect(rule).toBe(`${knobsPlace.selector}{}`)
})
