import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Form, Input } from '../src/index.js'

// An amount stored in minor units, shown as a decimal: the case `format` exists
// for, since `String(1234)` is not what a person typed.
const Cents = Input.kind<{ readonly scale: number }>('Cents', {
  draft: 'text',
  parse: (draft, data) => {
    const value = Number(draft.replaceAll(',', ''))
    return draft.trim() === '' || !Number.isFinite(value)
      ? undefined
      : Math.round(value * 10 ** data.scale)
  },
  format: (value, data) => (Number(value) / 10 ** data.scale).toFixed(data.scale),
  unparsed: 'Enter an amount',
})

const Price = Schema.Struct({ price: Schema.Number })
const PriceForm = Form.make('Price', Form.input(Price), {
  inputs: { price: Cents.of({ scale: 2 }) },
})

describe('A control that formats its value', () => {
  it('fills the draft with the control text, and the value it came from still submits', () => {
    const filled = PriceForm.fill(PriceForm.initial, { price: 1234 }).model
    expect(filled.fields.price.value).toBe('12.34')
    // A fill leaves the key unvalidated, so the value is read once it is checked.
    const checked = PriceForm.bundle.update(
      filled,
      PriceForm.Message.ValidatedAll(),
      undefined,
    ).model
    expect(PriceForm.engine.value(checked)).toEqual({ price: 1234 })
  })

  it('fills what the format makes of a value it was not written for, as text', () => {
    const filled = PriceForm.fill(PriceForm.initial, { price: 5 }).model
    expect(filled.fields.price.value).toBe('0.05')
  })

  it('reads the filled text back through parse, not the detached number', () => {
    const filled = PriceForm.fill(PriceForm.initial, { price: 999 }).model
    const typed = PriceForm.bundle.update(
      filled,
      PriceForm.Message.Changed({ key: 'price', value: '12.34' }),
      undefined,
    ).model
    expect(PriceForm.engine.value(typed)).toEqual({ price: 1234 })
  })

  it('leaves a form whose control formats nothing on String(value)', () => {
    const Plain = Form.make('Plain', Form.input(Price))
    expect(Plain.fill(Plain.initial, { price: 12.5 }).model.fields.price.value).toBe('12.5')
  })

  it('is not asked to show nothing', () => {
    const Quiet = Input.kind('Quiet', {
      draft: 'text',
      format: () => {
        throw new Error('format was asked about nothing')
      },
    })
    const MaybePrice = Schema.Struct({ price: Schema.NullOr(Schema.Number) })
    const QuietForm = Form.make('Quiet', Form.input(MaybePrice), {
      inputs: { price: Quiet.of({}) },
    })
    expect(QuietForm.fill(QuietForm.initial, { price: null }).model.fields.price.value).toBe('')
  })

  it('names the form and the key when it cannot show a value', () => {
    const Broken = Input.kind('Broken', {
      draft: 'text',
      format: () => {
        throw new Error('no')
      },
    })
    const BrokenForm = Form.make('Broken', Form.input(Price), {
      inputs: { price: Broken.of({}) },
    })
    expect(() => BrokenForm.fill(BrokenForm.initial, { price: 1 })).toThrow(
      'Form "Broken": "price" cannot show that value: no',
    )
  })
})
