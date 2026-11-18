/**
 * An icon's tile on a real page: a surface makes the box twice the icon's
 * size with the icon keeping its own, a circle rounds it fully, and a tone
 * colours it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { parse } from 'foldkit-media/icons'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Icon, IconSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({}))
const check = parse('<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>', 'check')
const bare = Style.forSlots(IconSlots)(Recipes.Icon({ size: 'lg' }))
const tile = Style.forSlots(IconSlots)(
  Recipes.Icon({ size: 'lg', surface: 'solid', tone: 'danger', shape: 'circle' }),
)
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

test('a tile is twice the icon around it, round, and filled with its tone', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    bare.css +
    tile.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'icon-tile'
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
            h.div([h.Id('bare')], [Icon.view({ icon: check, style: bare }, h)]),
            h.div([h.Id('tile')], [Icon.view({ icon: check, key: 't', style: tile }, h)]),
            h.span([h.Id('fill'), h.Style({ color: 'var(--fk-error-default)' })], []),
          ],
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.getElementById('tile')).not.toBeNull())
    const box = (id: string) => document.getElementById(id)!.firstElementChild!
    const icon = box('bare').getBoundingClientRect()
    const outer = box('tile').getBoundingClientRect()
    const inner = box('tile').querySelector('svg')!.getBoundingClientRect()
    expect(outer.width).toBeCloseTo(icon.width * 2, 0)
    expect(inner.width).toBeCloseTo(icon.width, 0)
    expect(getComputedStyle(box('tile')).backgroundColor).toBe(
      getComputedStyle(document.getElementById('fill')!).color,
    )
    expect(parseFloat(getComputedStyle(box('tile')).borderTopLeftRadius)).toBeGreaterThan(
      outer.width / 2 - 1,
    )
  } finally {
    handle.dispose()
  }
})
