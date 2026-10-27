/**
 * Chosen rows side by side in a multiple listbox, on a real page: the
 * corners between them square off, so the run is one block, and a chosen row
 * standing alone keeps all four.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { ListboxSlots, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'

// At unit knobs: what is measured here is the scale's nominal size or time.
const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const listbox = Style.forSlots(ListboxSlots)(Recipes.Listbox({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** Hourly and Daily chosen together, Weekly not, Monthly chosen alone. */
const rows = [
  ['Hourly', true],
  ['Daily', true],
  ['Weekly', false],
  ['Monthly', true],
] as const

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    listbox.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'merged-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const l = SlotView.buildersFor(ListboxSlots, [listbox.mixin], { input: undefined, h })
    return h.div(l.items.attrs([h.Role('listbox'), h.AriaMultiSelectable(true)]), [
      ...rows.map(([name, chosen]) =>
        h.div(l.item.attrs([h.Role('option'), h.AriaSelected(chosen), h.AriaLabel(name)]), [name]),
      ),
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

/** A row's corners: top start, top end, bottom end, bottom start. */
const corners = (name: string) => {
  const style = getComputedStyle(document.querySelector(`[aria-label="${name}"]`)!)
  return [
    style.borderStartStartRadius,
    style.borderStartEndRadius,
    style.borderEndEndRadius,
    style.borderEndStartRadius,
  ]
}

test('a run of chosen rows rounds only its outer corners', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Monthly"]')).not.toBeNull())
    const [round] = corners('Monthly')
    expect(round).not.toBe('0px')
    expect(corners('Hourly')).toEqual([round, round, '0px', '0px'])
    expect(corners('Daily')).toEqual(['0px', '0px', round, round])
    // A chosen row alone, and a row not chosen, keep their corners.
    expect(corners('Monthly')).toEqual([round, round, round, round])
    expect(corners('Weekly')).toEqual([round, round, round, round])
  } finally {
    handle.dispose()
  }
})
