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
import { inkOffsetOf } from './ink.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(KbdSlots)(Recipes.Kbd({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (words: ReadonlyArray<string> = ['iiii', 'WWWW']) => {
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
            ...words.map(key => h.div([], [Kbd.view({ key, style }, h)])),
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

// The ink is dark on the keycap's light face. Measured on a screenshot of
// each key, a capital K sat 0.0px across and 0.5px high, and a command sign
// 0.5px left and 0.5px high: a half pixel is what a screenshot's whole pixels
// resolve, so the bound is a pixel, under which the old untrimmed line (a
// pixel high) falls out. The key's borders lie outside the 15% margin the
// reading leaves out.
test.each(['K', '\u2318'])("a key's ink is centered on its face: %s", async glyph => {
  const handle = mount([glyph])
  try {
    await vi.waitFor(() => expect(keys()).toHaveLength(1))
    const { x, y } = await inkOffsetOf(keys()[0]!, brightness => brightness < 128)
    expect(Math.abs(x)).toBeLessThan(1)
    expect(Math.abs(y)).toBeLessThan(1)
  } finally {
    handle.dispose()
  }
})
