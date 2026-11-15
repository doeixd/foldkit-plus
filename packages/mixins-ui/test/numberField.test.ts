/**
 * NumberField as markup and as arithmetic: where a value settles, and the
 * spinbutton the view draws for it, with its steppers out of the tab order
 * and disabled at their bound.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { NumberField, NumberFieldSlots, Patterns, Recipes } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(NumberFieldSlots)(Recipes.NumberField({}))
const drawn = (value: number | undefined, text: Record<string, unknown> = {}) =>
  NumberField.view(
    {
      id: 'servings',
      label: 'Servings',
      description: 'From 1 to 12.',
      value: value === undefined ? Option.none() : Option.some(value),
      onChange: () => message('Clicked'),
      min: 1,
      max: 12,
      style,
      ...text,
    },
    h,
  )

describe('NumberField.settled', () => {
  it.each([
    ['clamps below the minimum', -4, { min: 0, max: 10 }, 0],
    ['clamps above the maximum', 14, { min: 0, max: 10 }, 10],
    ['keeps a value on the step counted from the minimum', 7, { min: 1, step: 3 }, 7],
    ['rounds a value between steps to the nearer', 5.4, { min: 1, step: 3 }, 4],
    ['keeps a decimal step exact', 0.30000000000000004, { step: 0.1 }, 0.3],
  ] as const)('%s', (_, value, bounds, after) => {
    expect(NumberField.settled(value, bounds)).toBe(after)
  })
})

describe('NumberField.view', () => {
  it('meets the number field pattern', () => {
    expect(A11y.validate(Patterns.NumberField, NumberFieldSlots)).toEqual([])
  })

  it('draws a spinbutton named by its label and described, with its bounds', () => {
    const [input] = Inert.byTag(drawn(3), 'input')
    const [label] = Inert.byTag(drawn(3), 'label')
    expect(Inert.value(input, 'role')).toBe('spinbutton')
    expect(Inert.value(label, 'for')).toBe(Inert.value(input, 'id'))
    expect([Inert.value(input, 'aria-valuemin'), Inert.value(input, 'aria-valuemax')]).toEqual([
      '1',
      '12',
    ])
    expect(Inert.value(input, 'aria-describedby')).toBe('servings-description')
  })

  it('keeps its steppers out of the tab order, and disables the one at its bound', () => {
    const [decrease, increase] = Inert.byTag(drawn(1), 'button')
    expect(Inert.value(decrease, 'tabIndex')).toBe(-1)
    expect(Inert.value(decrease, 'disabled')).toBe(true)
    expect(Inert.value(increase, 'disabled')).toBeUndefined()
    expect(decrease?.data?.on?.['click']).toBeUndefined()
    expect(increase?.data?.on?.['click']).toBeTypeOf('function')
  })
})

describe('NumberField.parseNumber', () => {
  // Spellings ICU has used for one mark: a no-break or narrow no-break space, a straight or curly apostrophe.
  it.each([
    ['en-US', '1,234.5', 1234.5],
    ['en-US', '-1,234', -1234],
    ['en-US', '1234.5', 1234.5],
    ['de-DE', '1.234,5', 1234.5],
    ['de-DE', '1234,5', 1234.5],
    ['de-DE', '1.234', 1234],
    ['fr-FR', '1 234,5', 1234.5],
    ['fr-FR', '1 234,5', 1234.5],
    ['fr-FR', '1 234,5', 1234.5],
    ['fr-FR', '1234.5', 1234.5],
    ['de-CH', "1'234.5", 1234.5],
    ['de-CH', '1’234.5', 1234.5],
    ['en-IN', '12,34,567.5', 1234567.5],
    ['en-US', '−5', -5],
  ] as const)('%s reads %j as %s', (locale, text, number) => {
    expect(NumberField.parseNumber(text, locale)).toEqual(Option.some(number))
  })

  it.each([
    ['en-US', 'many'],
    ['en-US', '1.2.3'],
    ['de-DE', '1,2,3'],
    ['en-US', '1e3'],
    ['en-US', ''],
    ['fr-FR', '12 a'],
  ] as const)('%s reads %j as no number', (locale, text) => {
    expect(NumberField.parseNumber(text, locale)).toEqual(Option.none())
  })

  it.each([
    ['1,5', 1.5],
    ['1.5', 1.5],
    ['1 000', 1000],
  ] as const)('with no locale reads %j as %s', (text, number) => {
    expect(NumberField.parseNumber(text)).toEqual(Option.some(number))
  })

  it('reads what the locale draws', () => {
    for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN', 'ar-EG']) {
      const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 })
      for (const number of [0, 7, -1234.5, 1234567.891, 0.25]) {
        expect(
          NumberField.parseNumber(format.format(number), locale),
          `${locale} ${number}`,
        ).toEqual(Option.some(number))
      }
    }
  })
})

describe('NumberField.view locale', () => {
  it('draws and reads in the locale', () => {
    const [german] = Inert.byTag(drawn(1234.5, { locale: 'de-DE' }), 'input')
    expect(Inert.value(german, 'value')).toBe('1.234,5')
    expect(Inert.value(german, 'aria-valuetext')).toBe('1.234,5')
  })

  it('draws an empty field with no value and no aria-valuenow', () => {
    const [input] = Inert.byTag(drawn(undefined), 'input')
    expect(Inert.value(input, 'value')).toBe('')
    expect(Inert.value(input, 'aria-valuenow')).toBeUndefined()
    expect(Inert.value(input, 'aria-valuetext')).toBeUndefined()
  })
})

describe('NumberField.view form attributes', () => {
  it('names the input, and marks it required', () => {
    const [input] = Inert.byTag(drawn(3, { name: 'servings', required: true }), 'input')
    expect(Inert.value(input, 'name')).toBe('servings')
    expect(Inert.value(input, 'required')).toBe(true)
    expect(Inert.value(input, 'aria-required')).toBe('true')
    const [plain] = Inert.byTag(drawn(3), 'input')
    expect(Inert.value(plain, 'name')).toBeUndefined()
  })
})
