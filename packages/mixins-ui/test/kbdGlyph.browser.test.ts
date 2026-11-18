/**
 * A key that is a drawing, on a real page: the drawing stands at the height
 * of the letters. The keycap's own look is `kbd.browser.test.ts`.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Kbd, KbdSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(KbdSlots)(Recipes.Kbd({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

test('a key that is a drawing stands at the height of the letters, centred on the cap', async () => {
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
  container.id = 'kbd-glyph'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [],
          [
            Kbd.view(
              {
                key: h.span(
                  [h.Role('img'), h.AriaLabel('Right')],
                  [
                    h.svg(
                      [h.ViewBox('0 0 16 16')],
                      [h.path([h.Attribute('d', 'M6 3l5 5-5 5')], [])],
                    ),
                  ],
                ),
                style,
              },
              h,
            ),
          ],
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelector('kbd svg')).not.toBeNull())
    const key = document.querySelector('kbd')!
    const svg = document.querySelector('kbd svg')!
    const font = Number.parseFloat(getComputedStyle(key).fontSize)
    expect(svg.getBoundingClientRect().height).toBeCloseTo(font, 0)
    expect(svg.getBoundingClientRect().width).toBeCloseTo(font, 0)
  } finally {
    handle.dispose()
  }
})
