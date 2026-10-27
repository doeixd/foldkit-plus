/// <reference types="@vitest/browser-playwright" />
/**
 * Motion under reduced motion, in a real browser: what travels snaps through
 * the `travel` knob, a fade keeps its duration, and a scoped theme cannot
 * restore the travel the user turned off.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test } from 'vitest'
import { cdp } from 'vitest/browser'
import { glide } from '../src/recipes/design.js'
import { unitKnobs } from './fixture.js'

const L = Layers.standard
const overlay = Style.self(glide('fast', '1'))

const sheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  // At unit knobs: each tier's duration as written.
  L.in('tokens', Theme.root(Theme.standard(Theme.make(unitKnobs)))),
  L.in('components', overlay),
)
// A rule's class is a hash of its text, named when the sheet is written.
const overlayClass = /\.(style-[a-z0-9]+)\{transition/.exec(sheet)![1]!

const install = () => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = sheet
  document.head.append(style)
}

const draw = (attributes = '') => {
  const holder = document.createElement('div')
  holder.innerHTML = `<span class="${overlayClass}" ${attributes}></span>`
  document.body.append(holder)
  return holder.querySelector('span')!
}

const reduce = (value: 'reduce' | 'no-preference') =>
  cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  })

afterEach(async () => {
  await reduce('no-preference')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

test('an overlay travels on its tier and fades on the fast one', () => {
  install()
  expect(getComputedStyle(draw()).transitionDuration).toBe('0.08s, 0.08s, 0.08s, 0.08s')
})

test('under reduced motion the travel snaps and the fade stays', async () => {
  await reduce('reduce')
  install()
  expect(getComputedStyle(draw()).transitionDuration).toBe('0s, 0s, 0s, 0.08s')
})

test('an element that declares the knob itself cannot restore travel the user turned off', async () => {
  await reduce('reduce')
  install()
  const span = draw('style="--fk-knob-travel: 1"')
  expect(getComputedStyle(span).transitionDuration).toBe('0s, 0s, 0s, 0.08s')
})
