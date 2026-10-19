/**
 * The outlines' steps in a real browser: a divider parts two pieces of one
 * surface a step past `subtle`, on a dark page as on a light one.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme, Themes } from '../src/theme.js'

afterEach(() => document.head.querySelectorAll('style[data-test]').forEach(sheet => sheet.remove()))

/** The oklch lightness `color` resolves to on a page of `scheme`. */
const lightness = (scheme: 'light' | 'dark', color: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in(
      'theme',
      Theme.root(
        Theme.compose(
          Theme.tokens,
          Themes.make({ theme: Theme.make({}) }, { initial: 'theme' }).palette,
        ),
        { colorScheme: scheme },
      ),
    ),
  )
  document.head.append(sheet)
  const probe = document.createElement('div')
  probe.style.color = `oklch(from ${color} l c h)`
  document.body.append(probe)
  const read = getComputedStyle(probe).color
  probe.remove()
  sheet.remove()
  const match = /^oklch\(([\d.]+)/.exec(read)
  expect(match, read).not.toBeNull()
  return Number(match![1])
}

test.each(['light', 'dark'] as const)(
  'on a %s page a divider stands further from the surface than subtle',
  scheme => {
    const base = lightness(scheme, 'var(--fk-surface-base)')
    const away = (name: string) => Math.abs(lightness(scheme, `var(--fk-outline-${name})`) - base)
    expect(away('divider')).toBeGreaterThan(away('subtle') + 0.015)
    expect(away('divider')).toBeLessThan(away('default'))
  },
)
