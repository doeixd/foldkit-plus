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

/** One slider of `options`, its number in the Model, in a box of its own. */
const mountOne = (
  options: Partial<Slider.SliderView<Message, number>>,
  recipe: Parameters<typeof Recipe>[0] = {},
) => {
  const look = Style.forSlots(SliderSlots)(Recipe(recipe))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + look.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'slider-one'
  document.body.appendChild(container)
  const One = Schema.Struct({ volume: Schema.Number })
  return Runtime.embed(
    Runtime.makeElement({
      Model: One,
      container,
      init: () => ({ model: { volume: 40 } }),
      update: (model: typeof One.Type, message: Message) =>
        message._tag === 'Turned' && message.value !== model.volume
          ? { model: { volume: message.value } }
          : { model },
      view: (model: typeof One.Type, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ inlineSize: '20rem', padding: '3rem' })],
          [
            Slider.view(
              {
                id: 'one',
                label: 'Level',
                value: model.volume,
                step: 10,
                onChange: Turned,
                ...options,
                style: look,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

test('vertical, the track stands upright and the thumb climbs from the bottom', async () => {
  const handle = mountOne({ orientation: 'vertical' })
  try {
    await vi.waitFor(() => expect(thumb('one-value')).not.toBeNull())
    const control = controlOf('one-value').getBoundingClientRect()
    const track = controlOf('one-value').firstElementChild!.getBoundingClientRect()
    expect(track.height).toBeGreaterThan(track.width * 4)
    expect(track.width).toBeCloseTo(control.width, 0)
    // The fill runs from the bottom to the far edge of the thumb at 40%.
    const fill =
      controlOf('one-value').firstElementChild!.firstElementChild!.getBoundingClientRect()
    expect(fill.bottom).toBeCloseTo(track.bottom, 0)
    const edge = control.width
    expect(fill.height).toBeCloseTo(edge + (track.height - edge) * 0.4, 0)
    // A press near the top is near the maximum, which a left-to-right reading would not give.
    await userEvent.click(thumb('one-value')!, {
      position: { x: edge / 2, y: edge / 2 + (track.height - edge) * 0.1 },
    })
    await vi.waitFor(() => expect(thumb('one-value')!.getAttribute('aria-valuetext')).toBe('90'))
    thumb('one-value')!.focus()
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(thumb('one-value')!.getAttribute('aria-valuetext')).toBe('100'))
  } finally {
    handle.dispose()
  }
})

const wordsOf = (control: Element, text: string) => {
  const label = Array.from(control.querySelectorAll('span')).find(
    span => span.textContent === text,
  )!
  const words = document.createRange()
  words.selectNodeContents(label)
  return words.getBoundingClientRect()
}

test('a mark’s label sits under its dot, and a shown value at the end stays upright', async () => {
  const handle = mountOne(
    {
      orientation: 'horizontal',
      marks: [
        { value: 0, label: 'Off' },
        { value: 50, label: 'Half' },
        { value: 100, label: 'Max' },
      ],
      ticks: true,
      showValue: true,
      format: value => `${value}%`,
    },
    { value: 'end' },
  )
  try {
    await vi.waitFor(() => expect(thumb('one-value')).not.toBeNull())
    const control = controlOf('one-value')
    const dots = Array.from(control.querySelectorAll<HTMLElement>('[data-tick], [aria-hidden]'))
    const marks = dots.filter(dot => dot.textContent === '' && dot.tagName === 'SPAN')
    expect(marks).toHaveLength(11)
    const middle = marks[5]!.getBoundingClientRect()
    const half = wordsOf(control, 'Half')
    expect(half.top).toBeGreaterThanOrEqual(control.getBoundingClientRect().bottom)
    expect(half.left + half.width / 2).toBeCloseTo(middle.left + middle.width / 2, 0)
    // The value is the header's, after the label, and not drawn by the thumb.
    const output = control.previousElementSibling!.lastElementChild!
    expect(output.textContent).toBe('40%')
    expect(output.getBoundingClientRect().width).toBeGreaterThan(0)
    const byThumb = Array.from(control.querySelectorAll('span')).find(
      span => span.textContent === '40%',
    )!
    expect(getComputedStyle(byThumb).display).toBe('none')
  } finally {
    handle.dispose()
  }
})

test.each(['ltr', 'rtl'] as const)(
  '%s: the labels at either end keep inside the track, flush with its ends',
  async direction => {
    document.documentElement.dir = direction
    const handle = mountOne({
      orientation: 'horizontal',
      marks: [
        { value: 0, label: 'Minimum' },
        { value: 100, label: 'Maximum' },
      ],
    })
    try {
      await vi.waitFor(() => expect(thumb('one-value')).not.toBeNull())
      const control = controlOf('one-value')
      const box = control.getBoundingClientRect()
      const [start, end] = [wordsOf(control, 'Minimum'), wordsOf(control, 'Maximum')]
      const [left, right] = direction === 'ltr' ? [start!, end!] : [end!, start!]
      expect(left.left).toBeCloseTo(box.left, 0)
      expect(right.right).toBeCloseTo(box.right, 0)
    } finally {
      handle.dispose()
      document.documentElement.removeAttribute('dir')
    }
  },
)

test('vertical, a shown value above the thumb reads upright beside it', async () => {
  const handle = mountOne({
    orientation: 'vertical',
    showValue: true,
    format: value => `${value} dB`,
  })
  try {
    await vi.waitFor(() => expect(thumb('one-value')).not.toBeNull())
    const control = controlOf('one-value')
    const value = Array.from(control.querySelectorAll('span')).find(
      span => span.textContent === '40 dB',
    )!
    // The words' own box: the span is of no height, so they overflow it evenly.
    const words = document.createRange()
    words.selectNodeContents(value)
    const box = words.getBoundingClientRect()
    expect(box.width).toBeGreaterThan(box.height * 1.5)
    expect(box.right).toBeLessThanOrEqual(control.getBoundingClientRect().left)
    const track = control.firstElementChild!.getBoundingClientRect()
    const edge = control.getBoundingClientRect().width
    // Level with the thumb's center, 40% of the way up.
    const center = track.bottom - edge / 2 - (track.height - edge) * 0.4
    expect(box.top + box.height / 2).toBeCloseTo(center, 0)
  } finally {
    handle.dispose()
  }
})

test.each(['ltr', 'rtl'] as const)(
  '%s: a vertical slider climbs from the bottom, its labels upright on its far side',
  async direction => {
    document.documentElement.dir = direction
    const handle = mountOne({
      orientation: 'vertical',
      marks: [
        { value: 0, label: 'Min' },
        { value: 100, label: 'Max' },
      ],
    })
    try {
      await vi.waitFor(() => expect(thumb('one-value')).not.toBeNull())
      const control = controlOf('one-value')
      const box = control.getBoundingClientRect()
      const [min, max] = ['Min', 'Max'].map(text => {
        const label = Array.from(control.querySelectorAll('span')).find(
          span => span.textContent === text,
        )!
        const words = document.createRange()
        words.selectNodeContents(label)
        return words.getBoundingClientRect()
      })
      expect(min!.left).toBeGreaterThanOrEqual(box.right)
      expect(min!.width).toBeGreaterThan(min!.height)
      // The minimum at the bottom, a half thumb up; the maximum as far down from the top.
      expect(min!.top + min!.height / 2).toBeCloseTo(box.bottom - box.width / 2, 0)
      expect(max!.top + max!.height / 2).toBeCloseTo(box.top + box.width / 2, 0)
    } finally {
      handle.dispose()
      document.documentElement.removeAttribute('dir')
    }
  },
)
