/**
 * An indeterminate bar in a real browser: its fill sweeps from beyond the
 * track's inline start to beyond its inline end, so right to left it enters
 * on the right and leaves on the left.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Progress, ProgressSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ProgressSlots)(Recipes.Progress({}))
const Model = Schema.Struct({})
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (direction: 'ltr' | 'rtl') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `progress-${direction}`
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: Model) => ({ model }),
      view: (_model: Model, h: HtmlBuilder<never>) =>
        h.div(
          [h.Dir(direction), h.Style({ inlineSize: '200px' })],
          [Progress.view({ id: 'load', label: 'Loading', value: Option.none(), style }, h)],
        ),
    }),
  )
}

/** The track's and the fill's boxes with the sweep held at `progress`, 0 to 1. */
const at = (progress: number) => {
  const track = document.querySelector('[role="progressbar"] > div')!
  const fill = track.firstElementChild!
  const [sweep] = fill.getAnimations()
  if (sweep === undefined) throw new Error('the fill does not move')
  sweep.pause()
  const duration = Number(sweep.effect!.getComputedTiming().duration)
  sweep.currentTime = duration * progress
  return { track: track.getBoundingClientRect(), fill: fill.getBoundingClientRect() }
}

test('left to right, the fill enters on the left and leaves on the right', async () => {
  const mounted = mount('ltr')
  try {
    await vi.waitFor(() => expect(document.querySelector('[role="progressbar"]')).not.toBeNull())
    const start = at(0)
    expect(start.fill.right).toBeLessThanOrEqual(start.track.left + 1)
    const end = at(0.999)
    expect(end.fill.left).toBeGreaterThanOrEqual(end.track.right - 2)
  } finally {
    mounted.dispose()
  }
})

test('right to left, the fill enters on the right and leaves on the left', async () => {
  const mounted = mount('rtl')
  try {
    await vi.waitFor(() => expect(document.querySelector('[role="progressbar"]')).not.toBeNull())
    const start = at(0)
    expect(start.fill.left).toBeGreaterThanOrEqual(start.track.right - 1)
    const end = at(0.999)
    expect(end.fill.right).toBeLessThanOrEqual(end.track.left + 2)
  } finally {
    mounted.dispose()
  }
})
