/**
 * What a theme's choice knobs draw, in a real browser: a wider border steps
 * the thicker ones up from it, a hard shadow style drops a solid copy with no
 * blur, the spring easing is the spring's curve, and ink outlines are the
 * text's own ink at their strength rather than the palette's lines.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme, Themes, type Standard, type Values } from '../src/theme.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** A probe of `property` drawn from `value`, under a root declaring `values` as a theme. */
const drawn = (values: Values<Standard>, property: string, value: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in(
      'theme',
      Theme.root(
        Theme.compose(
          Theme.tokens,
          Themes.make({ theme: Theme.make(values) }, { initial: 'theme' }).palette,
        ),
        { colorScheme: 'light' },
      ),
    ),
  )
  document.head.append(sheet)
  const probe = document.createElement('div')
  probe.style.borderStyle = 'solid'
  probe.style.setProperty(property, value)
  document.body.append(probe)
  const read = getComputedStyle(probe).getPropertyValue(property)
  probe.remove()
  sheet.remove()
  return read
}

test('a wider border steps the thicker ones up from it', () => {
  expect(drawn({ shape: { border: 3 } }, 'border-top-width', 'var(--fk-border-thick)')).toBe('4px')
  expect(drawn({}, 'border-top-width', 'var(--fk-border-thick)')).toBe('2px')
})

test('a hard shadow style drops a solid copy, a soft one blurs', () => {
  const hard = drawn({ shadow: { style: 'hard' } }, 'box-shadow', 'var(--fk-shadow-md)')
  const soft = drawn({}, 'box-shadow', 'var(--fk-shadow-md)')
  expect(hard).toMatch(/ 3px 3px 0px 0px$/)
  expect(soft).not.toMatch(/ 0px 0px$/)
})

test('the spring easing is the spring’s curve', () => {
  const spring = drawn(
    { motion: { easing: 'spring' } },
    'transition-timing-function',
    'var(--fk-motion-ease)',
  )
  expect(spring).toMatch(/^linear\(/)
  expect(drawn({}, 'transition-timing-function', 'var(--fk-motion-ease)')).toBe('ease-out')
})

test('ink outlines are the text’s own ink at their strength, not the palette’s line', () => {
  const ink = drawn({ shape: { outlines: 'ink' } }, 'color', 'var(--fk-outline-default)')
  const soft = drawn({}, 'color', 'var(--fk-outline-default)')
  const text = drawn(
    { shape: { outlines: 'ink' } },
    'color',
    'color-mix(in oklch, var(--fk-text-overt) 88%, transparent)',
  )
  expect(ink).toBe(text)
  expect(ink).not.toBe(soft)
})
