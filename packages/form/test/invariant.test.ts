/**
 * A form over an Entity with invariants judges the row its value describes on
 * submit, as the server will: a failure beside the keys its path names, the
 * whole input's when it names none the form sets, and nothing decided over a
 * field the form does not set.
 */
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Form } from '../src/index.js'

const Stock = Entity.define(
  'Stock',
  Schema.Struct({
    id: Schema.String,
    quantity: Schema.Number,
    reserved: Schema.Number,
    note: Schema.String,
  }),
).pipe(
  Entity.invariant('reservedWithinQuantity', f => Expr.lte(f.reserved, Expr.field(f.quantity)), {
    message: 'Reserved stock cannot exceed the quantity',
    path: ['reserved'],
  }),
  Entity.invariant('noteGiven', f => Expr.not(Expr.eq(f.note, 'nothing')), {
    message: 'Say something',
    path: ['id'],
  }),
)

const Both = Form.make(
  'Both',
  Entity.input(Stock, Schema.Struct({ quantity: Schema.Number, reserved: Schema.Number })),
)
const QuantityOnly = Form.make(
  'QuantityOnly',
  Entity.input(Stock, Schema.Struct({ quantity: Schema.Number })),
)
const NoteOnly = Form.make('NoteOnly', Entity.input(Stock, Schema.Struct({ note: Schema.String })))

/** A form's bundle run over `messages` from its first Model, with what it last sent out. */
const after = <Model, Message, Out>(
  bundle: {
    readonly init: (flags: undefined) => { readonly model: Model }
    readonly update: (
      model: Model,
      message: Message,
      flags: undefined,
    ) => { readonly model: Model; readonly outMessage?: Out | undefined }
  },
  messages: ReadonlyArray<Message>,
): { readonly model: Model; readonly outMessage?: Out | undefined } =>
  messages.reduce<{ readonly model: Model; readonly outMessage?: Out | undefined }>(
    (state, message) => bundle.update(state.model, message, undefined),
    { model: bundle.init(undefined).model },
  )

const both = (quantity: string, reserved: string) =>
  after(Both.bundle, [
    Both.Message.Changed({ key: 'quantity', value: quantity }),
    Both.Message.Changed({ key: 'reserved', value: reserved }),
    Both.Message.Submitted(),
  ])

describe('A form over an Entity with invariants', () => {
  it('does not submit a row that breaks one, and shows it beside the key its path names', () => {
    const { model, outMessage } = both('3', '5')
    expect(outMessage).toBeUndefined()
    expect(model.fields.reserved).toEqual({
      _tag: 'Invalid',
      value: '5',
      errors: ['Reserved stock cannot exceed the quantity'],
    })
    expect(model.errors).toEqual([])
  })

  it('submits a row that holds every one it can judge', () => {
    expect(both('5', '5').outMessage).toEqual({
      _tag: 'Submitted',
      value: { quantity: 5, reserved: 5 },
    })
  })

  it('judges nothing over a field it does not set: the server decides that one', () => {
    const { outMessage } = after(QuantityOnly.bundle, [
      QuantityOnly.Message.Changed({ key: 'quantity', value: '-1' }),
      QuantityOnly.Message.Submitted(),
    ])
    expect(outMessage).toMatchObject({
      _tag: 'Submitted',
    })
  })

  it('shows a failure whose path it does not set on the whole input', () => {
    const { model, outMessage } = after(NoteOnly.bundle, [
      NoteOnly.Message.Changed({ key: 'note', value: 'nothing' }),
      NoteOnly.Message.Submitted(),
    ])
    expect(outMessage).toBeUndefined()
    expect(model.errors).toEqual(['Say something'])
  })
})
