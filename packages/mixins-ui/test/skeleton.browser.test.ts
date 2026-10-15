/**
 * A skeleton bar laid out by a real browser: it fills a container with a
 * width, and still shows in one that sizes to its content, where `100%` alone
 * resolved to nothing.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { Recipes, SkeletonSlots } from '../src/index.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const barIn = (container: string): HTMLElement => {
  const piece = Recipes.Skeleton({}).bar
  if (piece === undefined) throw new Error('no bar piece')
  const one = Style.forSlots(SkeletonSlots)({ bar: piece })
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.tokens)),
    ) + one.css
  document.head.append(sheet)
  const holder = document.createElement('div')
  const classes = [...piece.classes, ...one.rules.map(rule => rule.className)].join(' ')
  holder.innerHTML = `<div style="${container}"><div class="${classes}"></div></div>`
  document.body.append(holder)
  return holder.firstElementChild!.firstElementChild as HTMLElement
}

test('a bar fills a container that has a width', () => {
  expect(barIn('inline-size: 300px').getBoundingClientRect().width).toBe(300)
})

test('a bar shows in a container that sizes to its content', () => {
  const bar = barIn('display: inline-block')
  expect(bar.getBoundingClientRect().width).toBeGreaterThan(0)
  expect(bar.getBoundingClientRect().height).toBeGreaterThan(0)
})
