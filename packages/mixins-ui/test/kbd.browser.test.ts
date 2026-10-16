/**
 * Keys on a real page: set in a mono face, so every key of the same length
 * is as wide; on a keycap with a heavier lower edge and a lit top.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Kbd, KbdSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(KbdSlots)(Recipes.Kbd({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'kbd-browser'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [],
          [
            ...['iiii', 'WWWW'].map(key => h.div([], [Kbd.view({ key, style }, h)])),
            h.span([h.Id('lit'), h.Style({ color: 'var(--fk-surface-base)' })], []),
          ],
        ),
    }),
  )
}

const keys = () => Array.from(document.querySelectorAll<HTMLElement>('kbd'))

test('keys of the same length are as wide, in the mono face', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(keys()).toHaveLength(2))
    const [narrow, wide] = keys().map(key => key.getBoundingClientRect().width)
    expect(narrow).toBeCloseTo(wide!, 0)
  } finally {
    handle.dispose()
  }
})

test('a keycap has a heavier lower edge and a lit top inside it', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(keys()).toHaveLength(2))
    const key = getComputedStyle(keys()[0]!)
    expect(Number.parseFloat(key.borderBottomWidth)).toBeGreaterThan(
      Number.parseFloat(key.borderTopWidth),
    )
    // The first inset shadow is the lit top, in the page's base.
    const lit = getComputedStyle(document.querySelector('#lit')!).color
    expect(key.boxShadow.startsWith(`${lit} 0px 1px 0px 0px inset`), key.boxShadow).toBe(true)
  } finally {
    handle.dispose()
  }
})
