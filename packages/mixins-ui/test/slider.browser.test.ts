/**
 * The Slider on a real runtime, its value in the Model. One number: a
 * centered slider keeps a track wide enough to drag, and a press anywhere on
 * the track moves the thumb there. A range: each thumb is hit where its value
 * lies on the whole track, the fill's ends included, though the inputs
 * overlap, right to left too; the bar between the thumbs takes no pointer;
 * and the browser stops a thumb at the other, so End on the low one meets the
 * high one rather than the top.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Slider as Recipe } from '../src/recipes/slider.js'
import * as Slider from '../src/slider.js'
import { SliderSlots } from '../src/slider.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(SliderSlots)(Recipe({}))
const Model = Schema.Struct({
  volume: Schema.Number,
  price: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
})
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'Turned'; readonly value: number }
  | { readonly _tag: 'Moved'; readonly value: Slider.Range }
const Turned = (value: number): Message => ({ _tag: 'Turned', value })
const Moved = (value: Slider.Range): Message => ({ _tag: 'Moved', value })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

interface Placing {
  readonly dir?: 'rtl'
  readonly centered?: boolean
}

const mount = (initial: Model, options: Placing = {}) => {
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
  container.id = 'slider-browser'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [
        h.Style(
          options.centered === true
            ? { display: 'flex', justifyContent: 'center', inlineSize: '600px' }
            : { inlineSize: '20rem', padding: '2rem' },
        ),
        ...(options.dir === undefined ? [] : [h.Dir(options.dir)]),
      ],
      [
        Slider.view(
          { id: 'volume', label: 'Volume', value: model.volume, step: 5, onChange: Turned, style },
          h,
        ),
        Slider.view(
          {
            id: 'price',
            label: 'Price',
            value: model.price,
            max: 200,
            step: 10,
            onChange: Moved,
            style,
          },
          h,
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'Turned':
            return {
              model: message.value === model.volume ? model : { ...model, volume: message.value },
            }
          case 'Moved':
            return {
              model:
                message.value.low === model.price.low && message.value.high === model.price.high
                  ? model
                  : { ...model, price: message.value },
            }
        }
      },
      view,
    }),
  )
}

const thumb = (id: string) => document.getElementById(id)
const controlOf = (id: string) => thumb(id)!.parentElement!

/**
 * Where `value` of `max` lies on a control's whole track: a native thumb's
 * center travels its edge short of each end, from the inline start.
 */
const pointOf = (id: string, value: number, max: number, rtl = false) => {
  const box = controlOf(id).getBoundingClientRect()
  const edge = box.height
  const along = edge / 2 + ((box.width - edge) * value) / max
  return { x: rtl ? box.right - along : box.left + along, y: box.top + box.height / 2 }
}
const hitAt = (point: { readonly x: number; readonly y: number }) =>
  document.elementFromPoint(point.x, point.y)

test('a centered slider keeps a track wide enough to drag', async () => {
  const handle = mount({ volume: 60, price: { low: 60, high: 140 } }, { centered: true })
  try {
    await vi.waitFor(() => expect(thumb('volume-value')).not.toBeNull())
    const track = controlOf('volume-value').firstElementChild!.getBoundingClientRect()
    expect(track.width).toBeGreaterThanOrEqual(192)
  } finally {
    handle.dispose()
  }
})

test('one thumb moves to a press anywhere on the track, and the fill follows it', async () => {
  const handle = mount({ volume: 20, price: { low: 60, high: 140 } })
  try {
    await vi.waitFor(() => expect(thumb('volume-value')).not.toBeNull())
    const point = pointOf('volume-value', 75, 100)
    expect(hitAt(point)).toBe(thumb('volume-value'))
    await userEvent.click(thumb('volume-value')!, {
      position: {
        x: point.x - thumb('volume-value')!.getBoundingClientRect().left,
        y: point.y - thumb('volume-value')!.getBoundingClientRect().top,
      },
    })
    await vi.waitFor(() => expect(thumb('volume-value')!.getAttribute('aria-valuetext')).toBe('75'))
    // The fill reaches the far edge of the thumb, half an edge past its center.
    const control = controlOf('volume-value').getBoundingClientRect()
    const fill = controlOf('volume-value').firstElementChild!.firstElementChild!
    await vi.waitFor(() =>
      expect(fill.getBoundingClientRect().right).toBeCloseTo(point.x + control.height / 2, 0),
    )
  } finally {
    handle.dispose()
  }
})

test('each range thumb is hit where its value lies, though the inputs overlap', async () => {
  const handle = mount({ volume: 60, price: { low: 60, high: 140 } })
  try {
    await vi.waitFor(() => expect(thumb('price-low')).not.toBeNull())
    // The low thumb lies inside the high input's box, which must let it through.
    expect(hitAt(pointOf('price-low', 60, 200))).toBe(thumb('price-low'))
    expect(hitAt(pointOf('price-low', 140, 200))).toBe(thumb('price-high'))
    expect(hitAt(pointOf('price-low', 100, 200))).not.toBe(thumb('price-low'))
    expect(hitAt(pointOf('price-low', 100, 200))).not.toBe(thumb('price-high'))
    // The fill is the one element inside the track, the control's first.
    const track = controlOf('price-low').firstElementChild!
    const fill = track.firstElementChild!.getBoundingClientRect()
    const y = pointOf('price-low', 60, 200).y
    expect(hitAt({ x: fill.left + 1, y })).toBe(thumb('price-low'))
    expect(hitAt({ x: fill.right - 1, y })).toBe(thumb('price-high'))
  } finally {
    handle.dispose()
  }
})

test('right to left, each range thumb is hit where its value lies from the right', async () => {
  const handle = mount({ volume: 60, price: { low: 60, high: 140 } }, { dir: 'rtl' })
  try {
    await vi.waitFor(() => expect(thumb('price-low')).not.toBeNull())
    expect(hitAt(pointOf('price-low', 60, 200, true))).toBe(thumb('price-low'))
    expect(hitAt(pointOf('price-low', 140, 200, true))).toBe(thumb('price-high'))
    expect(hitAt(pointOf('price-low', 60, 200))).not.toBe(thumb('price-low'))
  } finally {
    handle.dispose()
  }
})

test('the browser stops each range thumb at the other', async () => {
  const handle = mount({ volume: 60, price: { low: 60, high: 140 } })
  try {
    await vi.waitFor(() => expect(thumb('price-low')).not.toBeNull())
    thumb('price-low')!.focus()
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => expect(thumb('price-low')!.getAttribute('aria-valuetext')).toBe('140'))
    thumb('price-high')!.focus()
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(thumb('price-high')!.getAttribute('aria-valuetext')).toBe('140'))
    thumb('price-low')!.focus()
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(thumb('price-low')!.getAttribute('aria-valuetext')).toBe('0'))
  } finally {
    handle.dispose()
  }
})

test('met at the top, the low thumb is the one the pointer reaches', async () => {
  const handle = mount({ volume: 60, price: { low: 200, high: 200 } })
  try {
    await vi.waitFor(() => expect(thumb('price-low')).not.toBeNull())
    expect(hitAt(pointOf('price-low', 200, 200))).toBe(thumb('price-low'))
  } finally {
    handle.dispose()
  }
})
