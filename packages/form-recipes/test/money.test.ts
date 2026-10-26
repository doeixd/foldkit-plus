// @vitest-environment jsdom
/**
 * `money`, `decimal` and `percent`, through a real form: exact amounts in three
 * locales and two stored forms, the drafts a person can be partway through, and
 * the grouping and decimals that are refused rather than guessed at.
 */
import { Schema } from 'effect'
import { Form, type Control } from 'foldkit-form'
import { SlotView } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { FieldRecipes } from '../src/index.js'
import { renderers } from '../src/html.js'

const spaced = (text: string) => text.replace(/[  ]/g, ' ')
/** What a control reads a draft as, and shows a value as. */
const read = (control: Control, draft: string) => control.parse!(draft, control.data)
const shown = (control: Control, value: unknown) => spaced(control.format!(value, control.data))

const usd = FieldRecipes.money({ currency: 'USD', unit: 'minor', locale: 'en-US', negative: true })
const eur = FieldRecipes.money({ currency: 'EUR', unit: 'minor', locale: 'de-DE' })
const jpy = FieldRecipes.money({ currency: 'JPY', unit: 'minor', locale: 'ja-JP' })
const usdText = FieldRecipes.money({ currency: 'USD', unit: 'decimal', locale: 'en-US' })

describe('FieldRecipes.money', () => {
  it('shows a stored amount as the locale writes it', () => {
    expect(shown(usd.control, 123456)).toBe('$1,234.56')
    expect(shown(eur.control, 123456)).toBe('1.234,56 €')
    expect(shown(jpy.control, 1235)).toBe('￥1,235')
    expect(shown(usdText.control, '1234.5')).toBe('$1,234.50')
  })

  it.each([
    ['en-US', usd, ['$1,234.56', '$0.05', '-$1,234.56', '$1,234,567.00']],
    ['de-DE', eur, ['1.234,56 €', '0,05 €', '1.234.567,00 €']],
    ['ja-JP', jpy, ['￥1,235', '￥5', '￥1,234,567']],
  ] as const)('reads back what it shows, in %s', (_, recipe, texts) => {
    for (const text of texts)
      expect(shown(recipe.control, read(recipe.control, text)), text).toBe(text)
  })

  it('reads a typed amount in exact minor units, or as decimal text', () => {
    expect(read(usd.control, '1,234.56')).toBe(123456)
    expect(read(usd.control, '1234.5')).toBe(123450)
    expect(read(eur.control, '1.234,56')).toBe(123456)
    expect(read(eur.control, '12,3')).toBe(1230)
    expect(read(jpy.control, '1,235')).toBe(1235)
    expect(read(usdText.control, '1,234.5')).toBe('1234.50')
    // Grouping as the locale groups, which is not always in thousands.
    const inr = FieldRecipes.money({ currency: 'INR', unit: 'minor', locale: 'en-IN' })
    expect(read(inr.control, '12,34,567.89')).toBe(123456789)
    expect(read(inr.control, '1,234,567.89')).toBeUndefined()
  })

  it('keeps a negative and a ten-digit amount to the cent', () => {
    expect(read(usd.control, '-1,234,567,890.12')).toBe(-123456789012)
    expect(shown(usd.control, -123456789012)).toBe('-$1,234,567,890.12')
    expect(read(usdText.control, '12345678901234567.89')).toBe('12345678901234567.89')
  })

  it.each([
    ['12,3', 'grouped as no thousand is', usd],
    ['12.3', 'a point where the locale groups', eur],
    ['1.234', 'more decimals than a cent', usd],
    ['1,235.5', 'a yen has no decimals', jpy],
    ['-5', 'negative where it may not be', eur],
    ['1.2.3', 'two points', usd],
    ['$', 'no digits', usd],
    ['99999999999999999', 'more cents than an integer holds exactly', usd],
  ] as const)('refuses %s: %s', (draft, _, recipe) => {
    expect(read(recipe.control, draft)).toBeUndefined()
  })

  it('refuses to show an amount of the wrong form, rather than rounding it', () => {
    expect(() => shown(usd.control, 12.5)).toThrow(/integer/)
    expect(() => shown(usdText.control, '1234.567')).toThrow(/decimal text of at most 2/)
    expect(() => shown(usdText.control, 1234)).toThrow(/decimal text/)
  })

  it('refuses a currency code that is not one, when it is made', () => {
    expect(() => FieldRecipes.money({ currency: 'dollars', unit: 'minor' })).toThrow(
      /"dollars" is not an ISO 4217 code/,
    )
  })

  it('reads in a list as it is shown', () => {
    expect(spaced(eur.display.text(123456, {}))).toBe('1.234,56 €')
    expect(eur.display.text('lots', {})).toBe('lots')
  })
})

describe('an amount being typed, in a form', () => {
  const Price = Form.make('Price', Form.input(Schema.Struct({ price: Schema.Number })), {
    inputs: { price: usd.control },
  })
  const typed = (draft: string) =>
    Price.bundle.update(
      Price.initial,
      Price.Message.Changed({ key: 'price', value: draft }),
      undefined,
    ).model
  const submitted = (draft: string) =>
    Price.bundle.update(typed(draft), Price.Message.ValidatedAll(), undefined).model

  // The form checks a key as it changes, so a partial amount says so at once:
  // with the recipe's words, and never as a number it is not.
  it.each(['-', '-$', '1,2', '$4.5.'])('reads the partial amount %j as no amount yet', draft => {
    expect(Price.field(typed(draft), 'price')).toMatchObject({ errors: ['Enter an amount'] })
    expect(Price.engine.value(submitted(draft))).toBeUndefined()
  })

  it('takes a draft that already names an amount, and says an empty one is required', () => {
    expect(Price.engine.value(submitted('4.'))).toEqual({ price: 400 })
    expect(Price.engine.value(submitted('-4'))).toEqual({ price: -400 })
    expect(Price.field(submitted(''), 'price')).toMatchObject({ errors: ['Required'] })
  })

  it('fills a stored amount as the locale writes it', () => {
    expect(Price.fill(Price.initial, { price: 123456 }).model.fields.price.value).toBe('$1,234.56')
  })
})

describe('FieldRecipes.decimal and percent', () => {
  const weight = FieldRecipes.decimal({ scale: 3, locale: 'de-DE' })
  const share = FieldRecipes.percent({ unit: 'fraction', locale: 'en-US' })
  const points = FieldRecipes.percent({ unit: 'points', scale: 1, locale: 'de-DE' })

  it('read a decimal in the locale, and refuse what it would round', () => {
    expect(read(weight.control, '1.234,5')).toBe(1234.5)
    expect(shown(weight.control, 1234.5)).toBe('1.234,5')
    expect(read(weight.control, '0,1234')).toBeUndefined()
    expect(() => shown(weight.control, 0.1 + 0.2)).toThrow(/at most 3 decimals/)
  })

  it('read a percentage as its share or its points, exactly', () => {
    expect(read(share.control, '12.5%')).toBe(0.125)
    expect(read(share.control, '7.1')).toBe(0.071)
    expect(shown(share.control, 0.125)).toBe('12.5%')
    expect(read(points.control, '12,5 %')).toBe(12.5)
    expect(shown(points.control, 12.5)).toBe('12,5 %')
  })
})

describe('the amounts’ plain renderers', () => {
  const Order = Form.make(
    'Order',
    Form.input(Schema.Struct({ total: Schema.Number, refund: Schema.Number, yen: Schema.Number })),
    {
      inputs: {
        total: FieldRecipes.money({ currency: 'USD', unit: 'minor' }).control,
        refund: usd.control,
        yen: jpy.control,
      },
    },
  )
  it('give the keypad an amount can be typed on', () => {
    const root = FormView.define(Order, { renderers: renderers() })(
      { model: Order.initial, errors: [], canSubmit: false },
      SlotView.inertBuilder(),
    )
    expect(
      Inert.byTag(root, 'input').map(input =>
        ['name', 'type', 'inputmode'].map(key => Inert.value(input, key)),
      ),
    ).toEqual([
      ['total', 'text', 'decimal'],
      ['refund', 'text', 'text'],
      ['yen', 'text', 'numeric'],
    ])
  })
})
