/// <reference types="@vitest/browser-playwright" />
/**
 * A solid button's press on a real page: at rest its border is its fill, so
 * the fill reaches its edge; pressed (`:active`), the border clears, the
 * fill stands exactly 1px in on every side, deepens to the family's `active`,
 * and the button gives a little (a 0.98 scale) unless `travel` is 0, as
 * under reduced motion; let go, it comes back. The press is forced through
 * Chrome: a real held mouse races the other test files, which share one
 * pointer and move or press it while this one holds it down. For the same
 * reason nothing here takes the real pointer (`pointer-events: none`): a
 * pointer another file left over the button hovered it, and the hover's fill
 * read as the resting one.
 *
 * A row and a fluid highlight press too: the state film is laid at 1.75 while
 * held, and the highlight takes it while `FluidHover` marks its container.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { ButtonSlots, Recipes, SegmentedSlots, TableSlots, TabsSlots } from '../src/index.js'
import { alpha, backgroundOf } from './colour.js'
import { force, nodeOf } from './pseudoState.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const button = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const Model = Schema.Struct({})
const unpointable = 'body * { pointer-events: none !important; }'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (travel?: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    button.css +
    unpointable
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'press-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const b = SlotView.buildersFor(ButtonSlots, [button.mixin], { input: undefined, h })
    return h.div(travel === undefined ? [] : [h.Style({ '--fk-knob-travel': travel })], [
      h.button(b.button.attrs([h.Type('button'), h.Id('press-target')]), ['Save']),
    ])
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

/** Holds a node pressed, under the pointer as a real press is, or lets it go. */
const press = (nodeId: number, held: boolean) => force(nodeId, held ? ['hover', 'active'] : [])

const transparent = 'rgba(0, 0, 0, 0)'

test('pressed, a solid button stands 1px in on every side, and comes back when let go', async () => {
  const handle = mount()
  try {
    const element = await vi.waitFor(() => {
      const found = document.querySelector('button')
      expect(found).not.toBeNull()
      return found!
    })
    const style = getComputedStyle(element)
    // At rest the border is the fill, so the fill reaches the edge.
    await vi.waitFor(() => expect(style.borderTopColor).toBe(style.backgroundColor))
    expect(style.backgroundClip).toBe('padding-box')
    const resting = style.backgroundColor
    // One lookup for both: a second `DOM.getDocument` hands out new ids.
    const target = await nodeOf('#press-target')
    await press(target, true)
    await vi.waitFor(() => expect(style.borderTopColor).toBe(transparent))
    expect(style.borderTopWidth).toBe('1px')
    // The fill stops inside the cleared border, or it would still reach the edge.
    expect(style.backgroundClip).toBe('padding-box')
    await vi.waitFor(() => expect(style.scale).toBe('0.98'))
    expect(style.backgroundColor).not.toBe(resting)
    await press(target, false)
    await vi.waitFor(() => expect(style.borderTopColor).toBe(style.backgroundColor))
    // At rest nothing sets a scale, so it computes as `none`; awaited, since
    // the way back runs the press transition in reverse.
    await vi.waitFor(() => expect(style.scale).toBe('none'))
    expect(style.backgroundColor).toBe(resting)
  } finally {
    handle.dispose()
  }
})

test('with travel at 0, as under reduced motion, a held button deepens but keeps its size', async () => {
  const handle = mount('0')
  try {
    const element = await vi.waitFor(() => {
      const found = document.querySelector('button')
      expect(found).not.toBeNull()
      return found!
    })
    const style = getComputedStyle(element)
    await vi.waitFor(() => expect(style.borderTopColor).toBe(style.backgroundColor))
    const resting = style.backgroundColor
    const target = await nodeOf('#press-target')
    await press(target, true)
    await vi.waitFor(() => expect(style.backgroundColor).not.toBe(resting))
    // Read once the press has finished moving: mid-transition, a scale on
    // its way to 0.98 still reads 1.
    await vi.waitFor(() => expect(element.getAnimations()).toHaveLength(0))
    expect(style.scale).toBe('1')
    await press(target, false)
  } finally {
    handle.dispose()
  }
})

const table = Style.forSlots(TableSlots)(Recipes.Table({}))
const filled = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
const pill = Style.forSlots(TabsSlots)(Recipes.Tabs({ variant: 'pill' }))
const highlights = ['table-highlight', 'segmented-highlight', 'tabs-highlight']

/** Table's expand toggle and the three fluid highlights, drawn bare over the sheet. */
const mountRows = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    table.css +
    filled.css +
    pill.css +
    '* { transition: none !important; }' +
    unpointable
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'press-rows'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const tableSlots = SlotView.buildersFor(TableSlots, [table.mixin], { input: undefined, h })
    const segmented = SlotView.buildersFor(SegmentedSlots, [filled.mixin], { input: undefined, h })
    const tabs = SlotView.buildersFor(TabsSlots, [pill.mixin], { input: undefined, h })
    return h.div(
      [h.Id('rows-root')],
      [
        h.div([h.Id('away'), h.Style({ height: '40px' })], []),
        h.div(tableSlots.highlight.attrs([h.Id('table-highlight')]), []),
        h.button(tableSlots.expandButton.attrs([h.Id('table-expand'), h.Type('button')]), ['+']),
        h.div(segmented.highlight.attrs([h.Id('segmented-highlight')]), []),
        h.div(tabs.highlight.attrs([h.Id('tabs-highlight')]), []),
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

test('a held row lays the hover’s film at 1.75, darker than the hover it was', async () => {
  const handle = mountRows()
  try {
    await vi.waitFor(() => expect(document.getElementById('table-expand')).not.toBeNull())
    const target = await nodeOf('#table-expand')
    await force(target, ['hover'])
    const hovered = await vi.waitFor(() => {
      const film = backgroundOf('table-expand')
      expect(alpha(film)).toBeGreaterThan(0)
      return film
    })
    await force(target, ['hover', 'active'])
    await vi.waitFor(() =>
      expect(alpha(backgroundOf('table-expand'))).toBeGreaterThan(alpha(hovered)),
    )
    await force(target, [])
  } finally {
    handle.dispose()
  }
})

test('a fluid highlight takes the press while the item it lights is held', async () => {
  const handle = mountRows()
  try {
    await vi.waitFor(() => expect(document.getElementById('table-highlight')).not.toBeNull())
    const root = document.getElementById('rows-root')!
    const hovered = highlights.map(backgroundOf)
    expect(hovered.map(alpha).every(paint => paint > 0)).toBe(true)
    root.setAttribute('data-fluid-held', 'hover')
    const held = highlights.map(backgroundOf)
    root.removeAttribute('data-fluid-held')
    expect(highlights.map((id, at) => [id, alpha(held[at]!) > alpha(hovered[at]!)])).toEqual(
      highlights.map(id => [id, true]),
    )
    expect(highlights.map(backgroundOf)).toEqual(hovered)
  } finally {
    handle.dispose()
  }
})
