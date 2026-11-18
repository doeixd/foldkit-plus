/**
 * Meter in a real browser: a vertical one stands the track upright with the
 * fill resting on its end at its share of the height and as wide as the track,
 * whatever inline width upstream writes; its thickness is the size's; a
 * horizontal one is as before; and a segmented track is cut by a mask.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import * as Meter from '../src/meter.js'
import { MeterSlots } from '../src/meter.js'
import * as Recipes from '../src/recipes/meter.js'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({})
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async (options: Partial<Meter.MeterView<never>>, size: 'sm' | 'md' | 'lg' = 'md') => {
  const style = Style.forSlots(MeterSlots)(Recipes.Meter({ size }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'meter-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: Model) => ({ model }),
      view: (_model: Model, h: HtmlBuilder<never>) =>
        Meter.view({ id: 'tank', label: 'Tank', value: 25, style, ...options }, h),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('[role="meter"]')).not.toBeNull())
  const root = document.querySelector('[role="meter"]')!
  const track = root.children[1]!
  return { handle, root, track, fill: track.firstElementChild!, style }
}

test('an upright meter rests its fill on the track end at its share, as wide as the track', async () => {
  const { handle, track, fill } = await mount({ orientation: 'vertical', value: 25 })
  try {
    const t = track.getBoundingClientRect()
    const f = fill.getBoundingClientRect()
    expect(t.height).toBeGreaterThan(t.width * 4)
    expect(f.width).toBeCloseTo(t.width, 0)
    expect(f.height).toBeCloseTo(t.height * 0.25, 0)
    expect(f.bottom).toBeCloseTo(t.bottom, 0)
  } finally {
    await handle.dispose()
  }
})

test('a thicker size widens an upright track and thickens a flat one', async () => {
  const upright = await mount({ orientation: 'vertical' }, 'lg')
  const wide = upright.track.getBoundingClientRect().width
  await upright.handle.dispose()
  document.body.replaceChildren()
  const flat = await mount({}, 'lg')
  try {
    expect(wide).toBeCloseTo(12, 0)
    expect(flat.track.getBoundingClientRect().height).toBeCloseTo(12, 0)
  } finally {
    await flat.handle.dispose()
  }
})

test('a horizontal meter fills its share of the width', async () => {
  const { handle, track, fill } = await mount({ value: 40 })
  try {
    const t = track.getBoundingClientRect()
    expect(fill.getBoundingClientRect().width).toBeCloseTo(t.width * 0.4, 0)
    expect(fill.getBoundingClientRect().height).toBeCloseTo(t.height, 0)
  } finally {
    await handle.dispose()
  }
})

test('a segmented track is cut by a mask, in either direction', async () => {
  const flat = await mount({ segments: 4 })
  const flatMask = getComputedStyle(flat.track).maskImage
  await flat.handle.dispose()
  document.body.replaceChildren()
  const upright = await mount({ segments: 4, orientation: 'vertical' })
  try {
    expect(flatMask).toContain('to right')
    expect(getComputedStyle(upright.track).maskImage).toContain('to top')
  } finally {
    await upright.handle.dispose()
  }
})
