/**
 * Surfaces and their states on a real page: a popup's rows round
 * concentrically inside its panel at any radius, a neutral button is
 * see-through over the band it sits on, and a trigger's hover reads on a
 * page painted the surface it used to take.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ButtonSlots, MenuSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const menu = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const button = Style.forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral' }))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (page: string, root = '') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme, { colorScheme: 'light' })),
    ) +
    menu.css +
    button.css +
    `body{${page}}:root{${root}}`
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'state-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const m = SlotView.buildersFor(MenuSlots, [menu.mixin], { input: undefined, h })
    const b = SlotView.buildersFor(ButtonSlots, [button.mixin], { input: undefined, h })
    return h.div(
      [],
      [
        h.div(m.wrapper.attrs([]), [
          h.button(m.button.attrs([h.DataAttribute('part', 'trigger')]), ['Options']),
          h.div(m.items.attrs([h.DataAttribute('part', 'panel'), h.Role('menu')]), [
            h.button(m.item.attrs([h.DataAttribute('part', 'row'), h.Role('menuitem')]), [
              'Rename',
            ]),
          ]),
        ]),
        h.button(b.button.attrs([h.DataAttribute('part', 'neutral')]), ['Cancel']),
        // Where the pointer is put, away from the controls: one left over a trigger hovers it.
        h.div(
          [h.DataAttribute('part', 'away'), h.Style({ height: '40px', marginBlockStart: '200px' })],
          [],
        ),
      ],
    )
  }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
}

const part = (name: string) => document.querySelector<HTMLElement>(`[data-part="${name}"]`)!
const px = (value: string) => Number.parseFloat(value)
const drawn = () =>
  vi.waitFor(() => expect(document.querySelector('[data-part="row"]')).not.toBeNull())

test.each([
  ['1', 12],
  ['2', 24],
])('at radius factor %s the rows round concentrically inside the panel', async (factor, outer) => {
  // At the root, where the radius tokens resolve.
  const handle = mount('', `--fk-knob-radius-factor:${factor}`)
  try {
    await drawn()
    const panel = getComputedStyle(part('panel'))
    expect(px(panel.borderTopLeftRadius)).toBe(outer)
    const inset = px(panel.paddingTop) + px(panel.borderTopWidth)
    expect(px(getComputedStyle(part('row')).borderTopLeftRadius)).toBe(outer - inset)
  } finally {
    handle.dispose()
  }
})

test('a neutral button is see-through over the band it sits on', async () => {
  const handle = mount('background:oklch(70% 0.15 145)')
  try {
    await drawn()
    const fill = getComputedStyle(part('neutral')).backgroundColor
    // A color with an alpha below 1, in whatever space the browser reports it.
    expect(fill).toMatch(/\/ 0\.\d+\)$|, 0\.\d+\)$/)
  } finally {
    handle.dispose()
  }
})

test("a trigger's hover reads on a page painted the muted surface", async () => {
  const handle = mount('background:var(--fk-surface-muted)')
  try {
    await drawn()
    const trigger = part('trigger')
    await userEvent.hover(part('away'))
    const resting = getComputedStyle(trigger).backgroundColor
    await userEvent.hover(trigger)
    await vi.waitFor(() => expect(getComputedStyle(trigger).backgroundColor).not.toBe(resting))
    // Not the page's own color, which the hover used to be.
    const page = getComputedStyle(document.body).backgroundColor
    expect(getComputedStyle(trigger).backgroundColor).not.toBe(page)
  } finally {
    await userEvent.hover(part('away'))
    handle.dispose()
  }
})
