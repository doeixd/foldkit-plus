/**
 * What plain HTML gets from `Defaults` over a palette, in a real browser:
 * native controls in the accent, a rule and a key drawn as lines.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Defaults } from '../src/defaults.js'
import { Theme } from '../src/theme.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const install = () => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('defaults', Defaults.all),
    L.in('theme', Theme.root(theme, { colorScheme: 'light' })),
  )
  document.head.append(style)
}

const add = (html: string): Element => {
  const holder = document.createElement('div')
  holder.innerHTML = html
  document.body.append(holder)
  const first = holder.firstElementChild
  if (first === null) throw new Error('no element')
  return first
}

test('native checkboxes, radios and ranges take the accent', () => {
  install()
  const accent = getComputedStyle(add('<span style="color:var(--fk-accent-default)"></span>')).color
  expect(getComputedStyle(add('<input type="checkbox">')).accentColor).toBe(accent)
})

test('a rule is one line, and a key a raised one', () => {
  install()
  const rule = getComputedStyle(add('<hr>'))
  expect([rule.borderTopStyle, rule.borderTopWidth, rule.borderBottomStyle]).toEqual([
    'solid',
    '1px',
    'none',
  ])
  const key = getComputedStyle(add('<kbd>K</kbd>'))
  expect([key.borderTopWidth, key.borderBottomWidth]).toEqual(['1px', '2px'])
})
