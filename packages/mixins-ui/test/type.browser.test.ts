/// <reference types="@vitest/browser-playwright" />
/**
 * A field's text on a touch screen, in a real browser: 16px under a coarse
 * pointer, where iOS Safari would otherwise zoom the page into it, and the
 * body role's 14px under a fine one.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test } from 'vitest'
import { cdp } from 'vitest/browser'
import { InputSlots, Recipes } from '../src/index.js'

const input = Style.forSlots(InputSlots)(Recipes.Input({}))

/** A touch screen, as DevTools emulates one: its pointer is coarse. */
const pointer = (value: 'coarse' | 'fine') =>
  cdp().send('Emulation.setTouchEmulationEnabled', {
    enabled: value === 'coarse',
    maxTouchPoints: 1,
  })

afterEach(async () => {
  await pointer('fine')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** The Input recipe's control, by the class its sheet names first. */
const field = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('tokens', Theme.root(Theme.tokens)),
    ) + input.css
  document.head.append(sheet)
  const name = /\.(style-[a-z0-9]+)\{/.exec(input.css)![1]!
  const element = document.createElement('input')
  element.className = name
  document.body.append(element)
  return element
}

test('a field reads the body role under a fine pointer', async () => {
  await pointer('fine')
  expect(getComputedStyle(field()).fontSize).toBe('14px')
})

test('a field is 16px under a coarse pointer, so iOS does not zoom into it', async () => {
  await pointer('coarse')
  expect(matchMedia('(pointer: coarse)').matches).toBe(true)
  expect(getComputedStyle(field()).fontSize).toBe('16px')
})
