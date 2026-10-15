/**
 * One Slider for a number or a range: `onChange` is handed the kind of value
 * the slider was given, and a range-only option is refused on one number.
 * Type-checked, not executed.
 */
import { expectTypeOf } from 'vitest'
import { Slider } from '../src/index.js'
import { h, message } from './fixture.js'

export const volume = Slider.view(
  {
    id: 'volume',
    label: 'Volume',
    value: 60,
    onChange: value => {
      expectTypeOf(value).toEqualTypeOf<number>()
      return message('Clicked')
    },
  },
  h,
)

export const price = Slider.view(
  {
    id: 'price',
    label: 'Price',
    value: { low: 10, high: 90 },
    thumbLabels: { low: 'From', high: 'To' },
    onChange: value => {
      expectTypeOf(value).toEqualTypeOf<Slider.Range>()
      return message('Clicked')
    },
  },
  h,
)

const named = { low: 'From', high: 'To' }
const fromNumber = (value: number) => message(value > 0 ? 'Clicked' : 'Other')
const fromRange = (value: Slider.Range) => message(value.low > 0 ? 'Clicked' : 'Other')
const base = { id: 'p', label: 'Price' }
const range = { low: 1, high: 9 }
const one = { ...base, value: 6, onChange: fromNumber }
const two = { ...base, value: range, onChange: fromRange }

// Each negative case is one line: TypeScript picks which overload's complaint to report, and where.
// @ts-expect-error one thumb is named by the label; thumb names are a range's.
export const labelledNumber = Slider.view({ ...one, thumbLabels: named }, h)

// @ts-expect-error a range's Message is built from a range, not a number.
export const crossed = Slider.view({ ...base, value: range, onChange: fromNumber }, h)

// Without the mistake each compiles, so each refusal above is the mistake's.
export const unnamedNumber = Slider.view(one, h)
export const namedRange = Slider.view({ ...two, thumbLabels: named }, h)
