/**
 * Every tinted hover follows the theme's `surface.hover` and
 * `surface.hoverStrength`, fluid highlights included: Table's, a filled
 * Segmented's and pill Tabs' highlights, a plain Segmented option under the
 * pointer, and Table's expand toggle. Read as computed colours on a real page,
 * since a hover's declaration can lose to a variant's.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, SegmentedSlots, TableSlots, TabsSlots } from '../src/index.js'
import { alpha, backgroundOf, painted } from './colour.js'

type Made = Parameters<typeof Theme.standard>[0]

afterEach(async () => {
  await userEvent.hover(document.getElementById('away') ?? document.body)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const table = Style.forSlots(TableSlots)(Recipes.Table({}))
const filled = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
const pill = Style.forSlots(TabsSlots)(Recipes.Tabs({ variant: 'pill' }))

/** Each highlight, and a plain Segmented tray, drawn through its recipe's slots in `made`. */
const mount = async (made: Made) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.standard(made))),
    ) +
    table.css +
    filled.css +
    pill.css +
    '* { transition: none !important; }'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'hover-ink'
  document.body.appendChild(container)
  const Model = Schema.Struct({})
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const tableSlots = SlotView.buildersFor(TableSlots, [table.mixin], { input: undefined, h })
    const segmented = SlotView.buildersFor(SegmentedSlots, [filled.mixin], { input: undefined, h })
    const tabs = SlotView.buildersFor(TabsSlots, [pill.mixin], { input: undefined, h })
    return h.div(
      [],
      [
        h.div([h.Id('away'), h.Style({ height: '40px' })], []),
        h.div(tableSlots.highlight.attrs([h.Id('table-highlight')]), []),
        h.button(tableSlots.expandButton.attrs([h.Id('table-expand'), h.Type('button')]), ['+']),
        h.div(segmented.highlight.attrs([h.Id('segmented-highlight')]), []),
        h.div(tabs.highlight.attrs([h.Id('tabs-highlight')]), []),
        h.div(segmented.group.attrs([h.Role('group')]), [
          h.button(segmented.option.attrs([h.Id('plain-option'), h.Type('button')]), ['Day']),
        ]),
      ],
    )
  }
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: m => ({ model: m }),
      view,
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('plain-option')).not.toBeNull())
  return handle
}

/** How far from grey: a tint of the accent has some, of the text none. */
const hue = ([r, g, b]: ReadonlyArray<number>) => Math.max(r!, g!, b!) - Math.min(r!, g!, b!)

const highlights = ['table-highlight', 'table-expand', 'segmented-highlight', 'tabs-highlight']
const accent = { accent: { hue: 265, chroma: 0.16 } } as const

test('the fluid highlights and Table’s toggle take the accent’s ink under Hover = accent, and none under neutral', async () => {
  const handle = await mount(Theme.make({ ...accent, surface: { hover: 'neutral' } }))
  // The toggle is a button: its hover is drawn only while hovered.
  await userEvent.hover(document.getElementById('table-expand')!)
  const neutral = highlights.map(backgroundOf)
  handle.dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  const tinted = await mount(Theme.make({ ...accent, surface: { hover: 'accent' } }))
  await userEvent.hover(document.getElementById('table-expand')!)
  const inked = highlights.map(backgroundOf)
  tinted.dispose()
  highlights.forEach((id, at) => {
    expect([id, hue(inked[at]!) > hue(neutral[at]!) + 8]).toEqual([id, true])
  })
})

test('every highlight deepens with the hover strength', async () => {
  const faint = await mount(Theme.make({ ...accent, surface: { hoverStrength: 6 } }))
  await userEvent.hover(document.getElementById('table-expand')!)
  const weak = highlights.map(backgroundOf)
  faint.dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  const strong = await mount(Theme.make({ ...accent, surface: { hoverStrength: 20 } }))
  await userEvent.hover(document.getElementById('table-expand')!)
  const deep = highlights.map(backgroundOf)
  strong.dispose()
  highlights.forEach((id, at) => {
    expect([id, alpha(deep[at]!) > alpha(weak[at]!)]).toEqual([id, true])
  })
})

test('a plain Segmented option tints under the pointer, as a fluid tray’s highlight does', async () => {
  const handle = await mount(Theme.make({ ...accent, surface: { hover: 'accent' } }))
  const option = document.getElementById('plain-option')!
  const resting = painted(getComputedStyle(option).backgroundColor)
  await userEvent.hover(option)
  await vi.waitFor(() =>
    expect(alpha(backgroundOf('plain-option'))).toBeGreaterThan(alpha(resting)),
  )
  handle.dispose()
})
