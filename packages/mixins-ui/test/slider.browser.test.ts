/**
 * The slider recipe on a real page: in a box that centers it, the track is
 * still wide enough to drag.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, SliderSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(SliderSlots)(Recipes.Slider({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const view = (_: unknown, h: HtmlBuilder<never>) => {
  const slots = SlotView.buildersFor(SliderSlots, [style.mixin], { input: undefined, h })
  return h.div(
    [h.Style({ display: 'flex', justifyContent: 'center', width: '600px' })],
    [
      h.div(slots.root.attrs(), [
        h.label(slots.label.attrs(), ['Volume']),
        h.div(slots.track.attrs([h.AriaLabel('track')]), [h.div(slots.thumb.attrs(), [])]),
      ]),
    ],
  )
}

test('a centered slider keeps a track wide enough to drag', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'slider-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelector('[aria-label="track"]')).toBeTruthy())
    const track = document.querySelector('[aria-label="track"]')!.getBoundingClientRect()
    expect(track.width).toBeGreaterThanOrEqual(192)
  } finally {
    handle.dispose()
  }
})
