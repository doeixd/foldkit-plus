/**
 * A range slider on a real runtime, its range in the Model: each thumb is hit
 * where its value lies on the whole track, the fill's ends included, though
 * the inputs overlap; the bar between the thumbs takes no pointer; and the
 * browser stops a thumb at the other, so End on the low one meets the high
 * one rather than the top.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as RangeSlider from '../src/rangeSlider.js'
import { RangeSliderSlots } from '../src/rangeSlider.js'
import { RangeSlider as Recipe } from '../src/recipes/rangeSlider.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(RangeSliderSlots)(Recipe({}))
const Model = Schema.Struct({ low: Schema.Number, high: Schema.Number })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Moved'; readonly value: RangeSlider.Range }
const Moved = (value: RangeSlider.Range): Message => ({ _tag: 'Moved', value })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (initial: Model) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'range-slider-browser'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Style({ inlineSize: '20rem', padding: '2rem' })],
      [
        RangeSlider.view(
          { id: 'price', label: 'Price', value: model, max: 200, step: 10, onChange: Moved, style },
          h,
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update: (model: Model, message: Message) => ({
        model:
          message.value.low === model.low && message.value.high === model.high
            ? model
            : message.value,
      }),
      view,
    }),
  )
}

const thumb = (which: 'low' | 'high') => document.getElementById(`price-${which}`)
const control = () => document.querySelector('[data-thumb]')?.parentElement

/** Where `value` lies on the whole track: a native thumb's center travels its edge short of each end. */
const pointOf = (value: number) => {
  const box = control()!.getBoundingClientRect()
  const edge = box.height
  return {
    x: box.left + edge / 2 + ((box.width - edge) * value) / 200,
    y: box.top + box.height / 2,
  }
}
const hitAt = (point: { readonly x: number; readonly y: number }) =>
  document.elementFromPoint(point.x, point.y)

test('each thumb is hit where its value lies on the whole track, though the inputs overlap', async () => {
  const handle = mount({ low: 60, high: 140 })
  try {
    await vi.waitFor(() => expect(thumb('low')).not.toBeNull())
    // The low thumb lies inside the high input's box, which must let it through.
    expect(hitAt(pointOf(60))).toBe(thumb('low'))
    expect(hitAt(pointOf(140))).toBe(thumb('high'))
    expect(hitAt(pointOf(100))).not.toBe(thumb('low'))
    expect(hitAt(pointOf(100))).not.toBe(thumb('high'))
    // The fill is the one element inside the track, the control's first.
    const fill = control()!.firstElementChild!.firstElementChild!.getBoundingClientRect()
    expect(hitAt({ x: fill.left + 1, y: pointOf(60).y })).toBe(thumb('low'))
    expect(hitAt({ x: fill.right - 1, y: pointOf(140).y })).toBe(thumb('high'))
  } finally {
    handle.dispose()
  }
})

test('the browser stops each thumb at the other', async () => {
  const handle = mount({ low: 60, high: 140 })
  try {
    await vi.waitFor(() => expect(thumb('low')).not.toBeNull())
    thumb('low')!.focus()
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => expect(thumb('low')!.getAttribute('aria-valuetext')).toBe('140'))
    thumb('high')!.focus()
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(thumb('high')!.getAttribute('aria-valuetext')).toBe('140'))
    thumb('low')!.focus()
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(thumb('low')!.getAttribute('aria-valuetext')).toBe('0'))
  } finally {
    handle.dispose()
  }
})

test('met at the top, the low thumb is the one the pointer reaches', async () => {
  const handle = mount({ low: 200, high: 200 })
  try {
    await vi.waitFor(() => expect(thumb('low')).not.toBeNull())
    expect(hitAt(pointOf(200))).toBe(thumb('low'))
  } finally {
    handle.dispose()
  }
})
