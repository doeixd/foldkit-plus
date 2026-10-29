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

// A currency or a percentage can group and separate decimals otherwise than a
// plain number, and rtl locales write bidi marks around an amount: each must read
// back what it shows.
describe('every amount reads back what it shows', () => {
  const locales = ['en-US', 'de-AT', 'de-CH', 'fr-CH', 'fr-FR', 'mr-IN', 'en-IN', 'he-IL']
  const more = ['ar-EG', 'ar-SA', 'fa-IR', 'ur-PK', 'ja-JP', 'tr-TR', 'ru-RU', 'pt-BR']
  /** What `locale` shows that it reads back as another value, or not at all. */
  const misreadIn = (locale: string): ReadonlyArray<string> => {
    const misread: Array<string> = []
    const check = (control: Control, value: unknown) => {
      const text = control.format!(value, control.data)
      if (read(control, text) !== value) misread.push(`${JSON.stringify(text)} for ${value}`)
    }
    for (const currency of ['USD', 'EUR', 'JPY', 'KWD', 'CHF']) {
      const money = FieldRecipes.money({ currency, unit: 'minor', locale, negative: true })
      for (const value of [0, 5, 123456, -123456, 123456789]) check(money.control, value)
    }
    const decimal = FieldRecipes.decimal({ scale: 3, locale, negative: true })
    for (const value of [1.5, -1234567.125]) check(decimal.control, value)
    const share = FieldRecipes.percent({ unit: 'fraction', locale, negative: true })
    for (const value of [0.125, -0.5, 12.34, -1234.5, 123456.78]) check(share.control, value)
    const points = FieldRecipes.percent({ unit: 'points', locale, negative: true })
    for (const value of [12.5, -123456.75]) check(points.control, value)
    return misread
  }
  it.each([...locales, ...more])('in %s', locale => expect(misreadIn(locale)).toEqual([]))

  // Each language's own conventions, where a region's differ least: `fy` and
  // `mr` were found this way.
  it('in every language the runtime formats', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    const languages = Intl.NumberFormat.supportedLocalesOf(
      [...letters].flatMap(first => [...letters].map(second => first + second)),
    )
    expect(languages.length).toBeGreaterThan(100)
    expect(
      Object.fromEntries(
        languages.flatMap(locale => {
          const misread = misreadIn(locale)
          return misread.length === 0 ? [] : [[locale, misread]]
        }),
      ),
    ).toEqual({})
  })

  // West Frisian writes money's minus last (#316).
  it('reads back a minus written after the amount, where the locale writes it there', () => {
    const fy = FieldRecipes.money({ currency: 'USD', unit: 'minor', locale: 'fy', negative: true })
    expect(shown(fy.control, -123456)).toBe('US$ 1.234,56-')
    expect(read(fy.control, 'US$ 1.234,56-')).toBe(-123456)
    expect(read(fy.control, '-US$ 1.234,56')).toBe(-123456)
    expect(read(fy.control, '1.234,56-')).toBe(-123456)
    // Not a second minus, and not where the locale never writes one.
    expect(read(fy.control, '-1.234,56-')).toBeUndefined()
    expect(read(usd.control, '1,234.56-')).toBeUndefined()
    const unsigned = FieldRecipes.money({ currency: 'USD', unit: 'minor', locale: 'fy' })
    expect(read(unsigned.control, 'US$ 1.234,56-')).toBeUndefined()
  })

  // These group a percentage in thousands and a plain number in lakhs (#317).
  it.each(['mr', 'ml', 'ne', 'or', 'te', 'mr-IN'])(
    'reads back a percentage past a thousand as %s groups it',
    locale => {
      const share = FieldRecipes.percent({ unit: 'fraction', locale, negative: true }).control
      const points = FieldRecipes.percent({ unit: 'points', locale, negative: true }).control
      expect(shown(share, -1234.5)).toBe('-123,450%')
      expect([read(share, shown(share, -1234.5)), read(share, '12,345,678%')]).toEqual([
        -1234.5, 123456.78,
      ])
      expect(read(points, shown(points, -123456.75))).toBe(-123456.75)
      // A number's own grouping is not the percentage's.
      expect(read(share, '1,23,450%')).toBeUndefined()
    },
  )

  it('takes a symbol at either end only, and no space where the locale groups with none', () => {
    expect(read(usd.control, '1 2 3')).toBeUndefined()
    expect(read(usd.control, '1$2')).toBeUndefined()
    expect(read(usd.control, '$ 12')).toBe(1200)
    expect(read(usd.control, '-$12')).toBe(-1200)
    expect(read(usd.control, '$-12')).toBe(-1200)
  })
})

describe('what a keyboard types, and what no number holds', () => {
  const chf = FieldRecipes.money({ currency: 'CHF', unit: 'minor', locale: 'de-CH' })
  it('reads the keyboard’s yen, apostrophe and full-width digits', () => {
    expect(read(jpy.control, '¥1,000')).toBe(1000)
    // Either apostrophe, whichever one the runtime's ICU writes.
    expect(read(chf.control, "1'234'567.50")).toBe(123456750)
    expect(read(chf.control, '1’234’567.50')).toBe(123456750)
    expect(read(jpy.control, '１０')).toBe(10)
  })

  it('refuses a decimal or a percentage a double would round', () => {
    const decimal = FieldRecipes.decimal({ scale: 2 })
    expect(read(decimal.control, '12345678901234567.89')).toBeUndefined()
    expect(read(decimal.control, '9007199254740993')).toBeUndefined()
    expect(read(decimal.control, '1234.56')).toBe(1234.56)
  })
})

describe('what is refused rather than guessed at', () => {
  const usdText = FieldRecipes.money({
    currency: 'USD',
    unit: 'decimal',
    locale: 'en-US',
    negative: true,
  })
  const eurText = FieldRecipes.money({ currency: 'EUR', unit: 'decimal', locale: 'de-DE' })
  it.each([
    ['a superscript', usdText, '10²'],
    ['circled digits', usdText, '①②'],
    ['a one-dot leader for a point', usdText, '1․5'],
    ['an override, which shows another order', usdText, '\u202e21'],
    ['a zero-width space', usdText, '1\u200b2'],
    ['a symbol at both ends', eurText, '€12€'],
    ['a symbol twice', eurText, '€€12'],
    ['a symbol around a minus twice', usdText, '$-$12'],
  ] as const)('%s', (_, recipe, draft) => expect(read(recipe.control, draft)).toBeUndefined())

  it('reads a value at any scale as the number holding it', () => {
    const fine = FieldRecipes.decimal({ scale: 17 })
    expect(read(fine.control, '0.1')).toBe(0.1)
    expect(shown(fine.control, 0.1)).toBe('0.1')
    const thirteen = FieldRecipes.decimal({ scale: 13 })
    expect(read(thirteen.control, '1234.1')).toBe(1234.1)
    expect(shown(thirteen.control, 1234.1)).toBe('1,234.1')
    expect(shown(FieldRecipes.decimal({ scale: 7 }).control, 1e-7)).toBe('0.0000001')
  })

  it('takes any ISO 4217 code, a metal or a fund too', () => {
    expect(
      read(
        FieldRecipes.money({ currency: 'XAU', unit: 'decimal', locale: 'en-US' }).control,
        '1.5',
      ),
    ).toBe('1.50')
    expect(FieldRecipes.money({ currency: 'CLF', unit: 'minor' }).control.data).toMatchObject({
      scale: 4,
    })
  })
})
