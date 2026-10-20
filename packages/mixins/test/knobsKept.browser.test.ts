/**
 * Kept knobs in a real browser: the head script's rule is unlayered, so it
 * beats the theme the layered stylesheet declares and every token re-derives
 * from it, while an element's inline style still beats it.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { KNOBS_FORMAT, KNOBS_KEY, knobScript, Theme } from '../src/theme.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test], style[data-fk-knobs]').forEach(element => {
    element.remove()
  })
  document.body.replaceChildren()
  document.documentElement.removeAttribute('style')
  localStorage.clear()
})

/** A corner drawn on `radius.md`. */
const corner = () => {
  const probe = document.createElement('div')
  probe.style.borderRadius = 'var(--fk-radius-md)'
  document.body.append(probe)
  return Number.parseFloat(getComputedStyle(probe).borderTopLeftRadius)
}

test("kept knobs beat the stylesheet's theme, and an inline style beats them", () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
  )
  document.head.append(sheet)
  expect(corner()).toBe(6)
  localStorage.setItem(
    KNOBS_KEY,
    JSON.stringify({ v: KNOBS_FORMAT, d: [['--fk-knob-radius-factor', '0']] }),
  )
  new Function(knobScript())()
  expect(corner()).toBe(0)
  document.documentElement.style.setProperty('--fk-knob-radius-factor', '1')
  expect(corner()).toBe(6)
})
