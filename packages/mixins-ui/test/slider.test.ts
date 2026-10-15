/**
 * The Slider as markup, for one number and for a range: native range thumbs
 * bounded by the bounds (or, in a range, by each other, so the browser stops
 * a drag at the other thumb), named by the label or each by its own name, and
 * the shares that place them; marks and shown values hidden from assistive
 * technology; and `moved`, which keeps a range ordered, bounded and on the
 * step. Where a thumb lands under the pointer is the browser's.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns } from '../src/index.js'
import * as Slider from '../src/slider.js'
import { SliderSlots } from '../src/slider.js'
import { Slider as Recipe } from '../src/recipes/slider.js'
import { message, type TestMessage } from './fixture.js'

const style = Style.forSlots(SliderSlots)(Recipe({}))
interface More {
  readonly disabled?: boolean
  readonly name?: string
  readonly marks?: ReadonlyArray<number>
  readonly showValue?: boolean
}

const shared = {
  id: 'price',
  label: 'Price',
  min: 0,
  max: 200,
  step: 10,
  format: (amount: number) => `$${amount}`,
  onChange: () => message('Clicked'),
  style,
}

// Drawn through `Inert.draw`, which alone marks the Slots that `bySlot` and `unslotted` read.
const Ranged = SlotView.forMessages<TestMessage>().define(
  SliderSlots,
  (input: { readonly value: Slider.Range; readonly more: More }, _, h) =>
    Slider.view({ ...shared, value: input.value, ...input.more }, h),
)
const Single = SlotView.forMessages<TestMessage>().define(
  SliderSlots,
  (input: { readonly value: number; readonly more: More }, _, h) =>
    Slider.view({ ...shared, value: input.value, ...input.more }, h),
)

const drawn = (value: Slider.Range, more: More = {}) => Inert.draw(Ranged, { value, more })
const one = (value: number, more: More = {}) => Inert.draw(Single, { value, more })

const thumbs = (value: Slider.Range, more: More = {}) => Inert.byTag(drawn(value, more), 'input')

describe('Slider.view', () => {
  it('meets the slider pattern', () => {
    expect(A11y.validate(Patterns.Slider, SliderSlots)).toEqual([])
  })

  describe('one number', () => {
    it('is one range thumb across the bounds, named by the label, saying its value', () => {
      const shown = one(40)
      const [label] = Inert.bySlot(shown, 'label')
      const [thumb, ...rest] = Inert.byTag(shown, 'input')
      expect(rest).toEqual([])
      expect(Inert.value(thumb, 'type')).toBe('range')
      expect(Inert.value(thumb, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
      expect(Inert.value(thumb, 'aria-label')).toBeUndefined()
      expect([Inert.value(thumb, 'min'), Inert.value(thumb, 'max')]).toEqual(['0', '200'])
      expect(Inert.value(thumb, 'value')).toBe('40')
      expect(Inert.value(thumb, 'aria-valuetext')).toBe('$40')
      expect(Inert.value(thumb, 'data-thumb')).toBe('value')
    })

    it('is no group, and fills from the start of the track', () => {
      const shown = one(50)
      expect(Inert.byRole(shown, 'group')).toEqual([])
      const [control] = Inert.bySlot(shown, 'control')
      expect(Inert.style(control)).toEqual({ '--fk-slider-low': '0', '--fk-slider-high': '0.25' })
      expect(Inert.value(control, 'data-range')).toBeUndefined()
    })

    it('listens on its thumb, and not when disabled', () => {
      const [on] = Inert.byTag(one(40), 'input')
      expect(typeof on?.data?.on?.['input']).toBe('function')
      const shown = one(40, { disabled: true })
      const [off] = Inert.byTag(shown, 'input')
      expect(Inert.value(off, 'disabled')).toBe(true)
      expect(off?.data?.on?.['input']).toBeUndefined()
      const [root] = Inert.bySlot(shown, 'root')
      expect(Inert.value(root, 'data-disabled')).toBe('')
      expect(Inert.value(root, 'aria-disabled')).toBeUndefined()
    })
  })

  describe('a range', () => {
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
      expect(Inert.style(control)).toEqual({
        '--fk-slider-low': '0.25',
        '--fk-slider-high': '0.75',
      })
      expect(Inert.value(control, 'data-range')).toBe('')
      expect(Inert.fixedInline(shown)).toEqual([])
      expect(Inert.unslotted(shown)).toEqual([])
    })

    it('raises the low thumb only when the high one is at the top, where it cannot move', () => {
      const control = (value: Slider.Range) => Inert.bySlot(drawn(value), 'control')[0]
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
      expect(
        thumbs({ low: 0, high: 200 }).some(thumb => Inert.value(thumb, 'name') !== undefined),
      ).toBe(false)
    })
  })

  describe('marks', () => {
    it('places each by its share, hidden, filled only where the fill covers it', () => {
      const marks = (shown: ReturnType<typeof one>) =>
        Inert.bySlot(shown, 'mark').map(mark => [
          Inert.style(mark)['--fk-slider-at'],
          Inert.value(mark, 'aria-hidden'),
          Inert.value(mark, 'data-filled') !== undefined,
        ])
      expect(marks(one(100, { marks: [0, 100, 150] }))).toEqual([
        ['0', 'true', true],
        ['0.5', 'true', true],
        ['0.75', 'true', false],
      ])
      expect(marks(drawn({ low: 50, high: 120 }, { marks: [0, 100, 150] }))).toEqual([
        ['0', 'true', false],
        ['0.5', 'true', true],
        ['0.75', 'true', false],
      ])
    })

    it('draws none unless asked', () => {
      expect(Inert.bySlot(one(100), 'mark')).toEqual([])
    })
  })

  describe('a shown value', () => {
    it('says each thumb’s value as formatted, hidden, placed by its share', () => {
      const shown = drawn({ low: 50, high: 150 }, { showValue: true })
      const values = Inert.bySlot(shown, 'value')
      expect(values.map(value => Inert.text(value))).toEqual(['$50', '$150'])
      expect(values.map(value => Inert.value(value, 'aria-hidden'))).toEqual(['true', 'true'])
      expect(values.map(value => Inert.style(value)['--fk-slider-at'])).toEqual(['0.25', '0.75'])
      expect(Inert.value(Inert.bySlot(shown, 'control')[0], 'data-values')).toBe('')
      expect(Inert.fixedInline(shown)).toEqual([])
    })

    it('is drawn only when asked', () => {
      const shown = one(40)
      expect(Inert.bySlot(shown, 'value')).toEqual([])
      expect(Inert.value(Inert.bySlot(shown, 'control')[0], 'data-values')).toBeUndefined()
    })
  })
})

describe('Slider.moved', () => {
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
    expect(Slider.moved(range, thumb, value, bounds)).toEqual(expected)
  })

  it('returns the same range when nothing changed, so update can keep its Model', () => {
    expect(Slider.moved(range, 'low', 40, bounds)).toBe(range)
    expect(Slider.moved(range, 'high', 122, bounds)).toBe(range)
    expect(Slider.moved(range, 'low', 50, bounds)).not.toBe(range)
  })
})
