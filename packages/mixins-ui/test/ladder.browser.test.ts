/**
 * The size ladder on a real page: a button, a field, a menu's trigger and
 * its rows, a segmented control and a table row all stand one rung tall,
 * 36px by default and 28px in a region set compact, and a size a recipe
 * chooses beats the region it sits in.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import {
  ButtonSlots,
  InputSlots,
  MenuSlots,
  Recipes,
  SegmentedSlots,
  TableSlots,
} from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const button = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const chosen = Style.forSlots(ButtonSlots)(Recipes.Button({ size: 'md' }))
const large = Style.forSlots(ButtonSlots)(Recipes.Button({ size: 'lg' }))
const input = Style.forSlots(InputSlots)(Recipes.Input({}))
const menu = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const segmented = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
const table = Style.forSlots(TableSlots)(Recipes.Table({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** One of each, under `data-region`, which a test may set compact. */
const controls = (h: HtmlBuilder<never>, region: string): Html => {
  const b = SlotView.buildersFor(ButtonSlots, [button.mixin], { input: undefined, h })
  const md = SlotView.buildersFor(ButtonSlots, [chosen.mixin], { input: undefined, h })
  const lg = SlotView.buildersFor(ButtonSlots, [large.mixin], { input: undefined, h })
  const i = SlotView.buildersFor(InputSlots, [input.mixin], { input: undefined, h })
  const m = SlotView.buildersFor(MenuSlots, [menu.mixin], { input: undefined, h })
  const s = SlotView.buildersFor(SegmentedSlots, [segmented.mixin], { input: undefined, h })
  const t = SlotView.buildersFor(TableSlots, [table.mixin], { input: undefined, h })
  return h.div(
    [h.DataAttribute('region', region)],
    [
      h.button(b.button.attrs([h.DataAttribute('part', 'button')]), ['Save']),
      h.button(md.button.attrs([h.DataAttribute('part', 'chosen')]), ['Save']),
      h.button(lg.button.attrs([h.DataAttribute('part', 'large')]), ['Save']),
      h.input(i.input.attrs([h.DataAttribute('part', 'input'), h.AriaLabel('Name')])),
      h.div(m.wrapper.attrs([]), [
        h.button(m.button.attrs([h.DataAttribute('part', 'trigger')]), ['Options']),
        h.div(m.items.attrs([h.Role('menu')]), [
          h.button(m.item.attrs([h.DataAttribute('part', 'row'), h.Role('menuitem')]), ['Rename']),
        ]),
      ]),
      h.div(s.group.attrs([h.DataAttribute('part', 'segmented'), h.Role('group')]), [
        h.button(s.option.attrs([h.AriaPressed('true')]), ['Day']),
      ]),
      h.table(t.root.attrs([]), [
        h.tbody(t.body.attrs([]), [
          h.tr(t.row.attrs([h.DataAttribute('part', 'table-row')]), [
            h.td(t.cell.attrs([]), ['1']),
          ]),
        ]),
      ]),
    ],
  )
}

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    [button, chosen, large, input, menu, segmented, table].map(each => each.css).join('') +
    '[data-region="compact"]{--fk-knob-step:1}' +
    '[data-region="flat"]{--fk-control-height:0px;--fk-control-height-compact:0px}'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'ladder-browser'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div([], [controls(h, 'default'), controls(h, 'compact'), controls(h, 'flat')]),
    }),
  )
}

const height = (region: string, part: string) =>
  document.querySelector(`[data-region="${region}"] [data-part="${part}"]`)!.getBoundingClientRect()
    .height

const rung = ['button', 'input', 'trigger', 'row', 'segmented', 'table-row']

test('every control and row stands one rung, 36px, on the page', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-part="row"]')).not.toBeNull())
    expect(Object.fromEntries(rung.map(part => [part, height('default', part)]))).toEqual(
      Object.fromEntries(rung.map(part => [part, 36])),
    )
  } finally {
    handle.dispose()
  }
})

test('a region set compact makes each of them 28px, the rows of a menu drawn in it included', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-part="row"]')).not.toBeNull())
    expect(Object.fromEntries(rung.map(part => [part, height('compact', part)]))).toEqual(
      Object.fromEntries(rung.map(part => [part, 28])),
    )
  } finally {
    handle.dispose()
  }
})

test('a size a recipe chooses beats the region, and lg is a half step up', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-part="row"]')).not.toBeNull())
    expect(height('compact', 'chosen')).toBe(36)
    expect(height('compact', 'large')).toBe(40)
  } finally {
    handle.dispose()
  }
})

const text = (region: string, part: string) => {
  const style = getComputedStyle(
    document.querySelector(`[data-region="${region}"] [data-part="${part}"]`)!,
  )
  return [style.fontSize, style.lineHeight]
}

test('the text steps with the controls: 14 on 20 by default, 13 on 18 compact', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-part="row"]')).not.toBeNull())
    for (const part of ['button', 'input', 'row']) {
      expect([part, ...text('default', part)]).toEqual([part, '14px', '20px'])
      expect(text('compact', part)).toEqual(['13px', '18px'])
    }
  } finally {
    handle.dispose()
  }
})

test("a segmented option's label is trimmed to its capitals, shorter than its line", async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-part="row"]')).not.toBeNull())
    // With no rung to fill, the option is as tall as its text: a 20px line, trimmed.
    const option = document.querySelector('[data-region="flat"] [data-part="segmented"] button')!
    expect(option.getBoundingClientRect().height).toBeLessThan(14)
  } finally {
    handle.dispose()
  }
})
