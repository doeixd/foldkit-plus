/**
 * An icon's drawing in a real browser: alone it is as tall as its text, and in
 * an `Icon.view` it fills the glyph's box, whatever the text's size.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Icon as MediaIcon } from 'foldkit-media'
import { parse } from 'foldkit-media/icons'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Icon, IconSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({}))
const L = Layers.standard
const Model = Schema.Struct({})
const style = Style.forSlots(IconSlots)(Recipes.Icon({}))
const check = parse('<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>', 'check')

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const size = (element: Element) => {
  const rect = element.getBoundingClientRect()
  return [Math.round(rect.width), Math.round(rect.height)]
}

test('a drawing alone is 1em square, and in a glyph it fills the box', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'icons'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ fontSize: '40px' })],
          [
            h.p([h.Id('alone')], [MediaIcon.draw(check, h)]),
            h.p([h.Id('glyph')], [Icon.view({ content: MediaIcon.draw(check, h), style }, h)]),
          ],
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('svg')).toHaveLength(2))
    expect(size(document.querySelector('#alone svg')!)).toEqual([40, 40])
    const glyph = document.querySelector('#glyph > span')!
    expect(size(glyph)[0]).toBeLessThan(40)
    expect(size(document.querySelector('#glyph svg')!)).toEqual(size(glyph))
  } finally {
    handle.dispose()
  }
})
