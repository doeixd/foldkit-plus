/**
 * A breadcrumb trail laid out by a real browser: each separator sits midway
 * between the step before it and the step after it, whichever the recipe
 * draws and in either direction.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Breadcrumb, BreadcrumbSlots, Recipes } from '../src/index.js'

const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

const mount = (separator: 'slash' | 'chevron' | 'dot', direction: 'ltr' | 'rtl') => {
  const style = Style.forSlots(BreadcrumbSlots)(Recipes.Breadcrumb({ separator }))
  document.documentElement.dir = direction
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.tokens)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'breadcrumb-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        Breadcrumb.view(
          {
            steps: [
              { label: 'Home', href: '/' },
              { label: 'Components', current: true },
            ],
            style,
          },
          h,
        ),
    }),
  )
}

/** The space on each side of the separator drawn before the second step, along the row. */
const spaces = () => {
  const [first, second] = Array.from(document.querySelectorAll('li'))
  const separator = getComputedStyle(second!, '::before')
  // Its border box: a chevron is two of its borders.
  const width = [
    'width',
    'border-left-width',
    'border-right-width',
    'padding-left',
    'padding-right',
  ]
    .map(property => parseFloat(separator.getPropertyValue(property)))
    .reduce((sum, each) => sum + each, 0)
  const step = second!.getBoundingClientRect()
  const words = second!.querySelector('span')!.getBoundingClientRect()
  const before = first!.getBoundingClientRect()
  return document.documentElement.dir === 'rtl'
    ? { before: before.left - step.right, after: step.right - width - words.right }
    : { before: step.left - before.right, after: words.left - (step.left + width) }
}

test.each([
  ['slash', 'ltr'],
  ['chevron', 'ltr'],
  ['dot', 'ltr'],
  ['slash', 'rtl'],
] as const)(
  'a %s separator, %s, has the same space after it as before',
  async (separator, direction) => {
    const handle = mount(separator, direction)
    try {
      await vi.waitFor(() => expect(document.querySelectorAll('li')).toHaveLength(2))
      const { before, after } = spaces()
      expect(before).toBeGreaterThan(0)
      expect(Math.abs(after - before)).toBeLessThan(1)
    } finally {
      handle.dispose()
    }
  },
)
