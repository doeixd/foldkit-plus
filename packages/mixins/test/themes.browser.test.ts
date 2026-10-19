/**
 * Themes installed by name, in a real browser: the root shows the initial
 * theme, a name chosen on the root shows another (its knobs re-derive every
 * token there), and a theme scoped to a subtree re-derives inside it, where
 * its knobs alone would not.
 */
import { Effect, Schema } from 'effect'
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme, Themes } from '../src/theme.js'

const round = Theme.make({ shape: { radius: 2 } })
const square = Theme.make({ shape: { radius: 0 } })
const themes = Themes.make({ round, square }, { initial: 'round' })

const install = (...pieces: ReadonlyArray<Parameters<typeof Layers.standard.in>[1]>) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(
    Layers.standard.declare,
    ...pieces.map(piece => Layers.standard.in('theme', piece)),
  )
  document.head.append(sheet)
}

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute(themes.attribute)
})

/** A corner drawn on `radius.md`, in `parent`. */
const corner = (parent: HTMLElement = document.body) => {
  const probe = document.createElement('div')
  probe.style.borderRadius = 'var(--fk-radius-md)'
  parent.append(probe)
  return Number.parseFloat(getComputedStyle(probe).borderTopLeftRadius)
}

test('the root shows the initial theme, and the theme the Model chooses', async () => {
  install(Theme.root(themes.root), themes.scoped)
  expect(corner()).toBe(12)
  await Effect.runPromise(Themes.apply(themes, 'square'))
  expect(document.documentElement.getAttribute('data-theme')).toBe('square')
  expect(corner()).toBe(0)
  await Effect.runPromise(Themes.apply(themes, 'round'))
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(corner()).toBe(12)
})

test('a theme scoped to a subtree re-derives its tokens there', () => {
  install(Theme.root(themes.root), Theme.scope(square, '.square-region'))
  const region = document.createElement('section')
  region.className = 'square-region'
  document.body.append(region)
  expect(corner(region)).toBe(0)
  // Outside it, the root's theme.
  expect(corner()).toBe(12)
})

test('a knob alone under a subtree changes nothing derived from it, as Theme.scope says', () => {
  install(Theme.root(themes.root))
  const region = document.createElement('section')
  region.style.setProperty('--fk-knob-radius-factor', '0')
  document.body.append(region)
  expect(corner(region)).toBe(12)
})

test('the names are a Schema for the Model field that holds the active one', () => {
  const decode = Schema.decodeUnknownSync(themes.Name)
  expect(decode('square')).toBe('square')
  expect(() => decode('oval')).toThrow()
})
