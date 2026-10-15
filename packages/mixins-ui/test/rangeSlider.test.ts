/**
 * RangeSlider as markup: a group named by its label holding two native range
 * thumbs, each bounded by the other so the browser stops a drag at it, and
 * the shares that place them on the control; and `moved`, which keeps a
 * range ordered, bounded and on the step. Where a thumb lands under the
 * pointer is the browser's.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns } from '../src/index.js'
import * as RangeSlider from '../src/rangeSlider.js'
import { RangeSliderSlots } from '../src/rangeSlider.js'
import { RangeSlider as Recipe } from '../src/recipes/rangeSlider.js'
import { message, type TestMessage } from './fixture.js'

const style = Style.forSlots(RangeSliderSlots)(Recipe({}))
interface More {
  readonly disabled?: boolean
  readonly name?: string
}

// Drawn through `Inert.draw`, which alone marks the Slots that `bySlot` and `unslotted` read.
const Drawn = SlotView.forMessages<TestMessage>().define(
  RangeSliderSlots,
  (input: { readonly value: RangeSlider.Range; readonly more: More }, _, h) =>
    RangeSlider.view(
      {
        id: 'price',
        label: 'Price',
        value: input.value,
        min: 0,
        max: 200,
        step: 10,
        format: amount => `$${amount}`,
        onChange: () => message('Clicked'),
        style,
        ...input.more,
      },
      h,
    ),
)

const drawn = (value: RangeSlider.Range, more: More = {}) => Inert.draw(Drawn, { value, more })

const thumbs = (value: RangeSlider.Range, more: More = {}) => Inert.byTag(drawn(value, more), 'input')

describe('RangeSlider.view', () => {
  it('meets the range slider pattern', () => {
    expect(A11y.validate(Patterns.RangeSlider, RangeSliderSlots)).toEqual([])
  })

  it('is a group named by its label, of two named range thumbs that say their values', () => {
    const [group] = Inert.byRole(drawn({ low: 40, high: 120 }), 'group')
    const [label] = Inert.byTag(group, 'span')
    expect(Inert.value(group, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    const [low, high] = Inert.byTag(group, 'input')
    expect([low, high].map(thumb => Inert.value(thumb, 'type'))).toEqual(['range', 'range'])
    expect([low, high].map(thumb => Inert.value(thumb, 'aria-label'))).toEqual([
      'Minimum',
      'Maximum',
    ])
    expect([low, high].map(thumb => Inert.value(thumb, 'value'))).toEqual(['40', '120'])
    expect([low, high].map(thumb => Inert.value(thumb, 'aria-valuetext'))).toEqual([
      '$40',
      '$120',
    ])
  })

  it('bounds each thumb by the other, so neither can pass it', () => {
    const [low, high] = thumbs({ low: 40, high: 120 })
    expect([Inert.value(low, 'min'), Inert.value(low, 'max')]).toEqual(['0', '120'])
    expect([Inert.value(high, 'min'), Inert.value(high, 'max')]).toEqual(['40', '200'])
  })

  it('places the thumbs by their shares of the range, the only inline style', () => {
    const shown = drawn({ low: 50, high: 150 })
    const [control] = Inert.bySlot(shown, 'control')
    expect(Inert.style(control)).toEqual({ '--fk-range-low': '0.25', '--fk-range-high': '0.75' })
    expect(Inert.fixedInline(shown)).toEqual([])
    expect(Inert.unslotted(shown)).toEqual([])
  })

  it('raises the low thumb only when the high one is at the top, where it cannot move', () => {
    const control = (value: RangeSlider.Range) => Inert.bySlot(drawn(value), 'control')[0]
    expect(Inert.value(control({ low: 200, high: 200 }), 'data-raised')).toBe('low')
    expect(Inert.value(control({ low: 0, high: 0 }), 'data-raised')).toBeUndefined()
  })

  it('listens on both thumbs, and on neither when disabled', () => {
    expect(thumbs({ low: 0, high: 200 }).map(thumb => typeof thumb.data?.on?.['input'])).toEqual([
      'function',
      'function',
    ])
    const off = thumbs({ low: 0, high: 200 }, { disabled: true })
    expect(off.map(thumb => Inert.value(thumb, 'disabled'))).toEqual([true, true])
    expect(off.some(thumb => thumb.data?.on?.['input'] !== undefined)).toBe(false)
    const [group] = Inert.byRole(drawn({ low: 0, high: 200 }, { disabled: true }), 'group')
    expect(Inert.value(group, 'aria-disabled')).toBe('true')
  })

  it('submits both values under one name when given one', () => {
    const named = thumbs({ low: 0, high: 200 }, { name: 'price' })
    expect(named.map(thumb => Inert.value(thumb, 'name'))).toEqual(['price', 'price'])
    expect(thumbs({ low: 0, high: 200 }).some(thumb => Inert.value(thumb, 'name') !== undefined)).toBe(
      false,
    )
  })
})

describe('RangeSlider.moved', () => {
  const range = { low: 40, high: 120 }
  const bounds = { min: 0, max: 200, step: 10 }

  it.each([
    ['low moves', 'low', 60, { low: 60, high: 120 }],
    ['high moves', 'high', 80, { low: 40, high: 80 }],
    ['low stops at high', 'low', 160, { low: 120, high: 120 }],
    ['high stops at low', 'high', 10, { low: 40, high: 40 }],
    ['low snaps to the step', 'low', 64, { low: 60, high: 120 }],
    ['low stays within min', 'low', -30, { low: 0, high: 120 }],
    ['high stays within max', 'high', 260, { low: 40, high: 200 }],
  ] as const)('%s', (_, thumb, value, expected) => {
    expect(RangeSlider.moved(range, thumb, value, bounds)).toEqual(expected)
  })

  it('returns the same range when nothing changed, so update can keep its Model', () => {
    expect(RangeSlider.moved(range, 'low', 40, bounds)).toBe(range)
    expect(RangeSlider.moved(range, 'high', 122, bounds)).toBe(range)
    expect(RangeSlider.moved(range, 'low', 50, bounds)).not.toBe(range)
  })
})
