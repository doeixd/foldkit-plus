/**
 * A radio group laid out by a real browser: its options stack unless the
 * group says it is a row, as upstream's groups are vertical by default.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { RadioGroupSlots, Recipes } from '../src/index.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const optionTops = (orientation: 'vertical' | 'horizontal'): ReadonlyArray<number> => {
  const piece = Recipes.RadioGroup({}).group
  if (piece === undefined) throw new Error('no group piece')
  const one = Style.forSlots(RadioGroupSlots)({ group: piece })
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.tokens)),
    ) + one.css
  document.head.append(sheet)
  const classes = [...piece.classes, ...one.rules.map(rule => rule.className)].join(' ')
  const holder = document.createElement('div')
  holder.innerHTML = `<div role="radiogroup" aria-orientation="${orientation}" class="${classes}"><label>Monthly</label><label>Yearly</label></div>`
  document.body.append(holder)
  return Array.from(holder.querySelectorAll('label'), label => label.getBoundingClientRect().top)
}

test('a vertical group stacks its options', () => {
  const [first, second] = optionTops('vertical')
  expect(second).toBeGreaterThan(first!)
})

test('a horizontal group lays its options in a row', () => {
  const [first, second] = optionTops('horizontal')
  expect(second).toBe(first)
})

test('a card whose radio is checked fills, and the others stay the page surface', () => {
  const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
  const piece = Recipes.RadioGroup({ variant: 'card' }).group
  if (piece === undefined) throw new Error('no group piece')
  const one = Style.forSlots(RadioGroupSlots)({ group: piece })
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    one.css
  document.head.append(sheet)
  const classes = [...piece.classes, ...one.rules.map(rule => rule.className)].join(' ')
  const holder = document.createElement('div')
  holder.innerHTML = `<div role="radiogroup" class="${classes}"><label id="on"><button role="radio" aria-checked="true"></button>Yearly</label><label id="off"><button role="radio" aria-checked="false"></button>Monthly</label></div>`
  document.body.append(holder)
  const fill = (id: string) => getComputedStyle(document.getElementById(id)!).backgroundColor
  expect(fill('on')).not.toBe(fill('off'))
})
