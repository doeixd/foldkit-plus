/**
 * A form over an Entity with invariants judges the row its value describes on
 * submit, as the server will: a failure beside the keys its path names, the
 * whole input's when it names none the form sets, and nothing decided over a
 * field the form does not set.
 */
import { Schema } from 'effect'
import { Entity, Expr, Operators } from 'foldkit-entity'
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
  Entity.invariant(
    'reservedWithinQuantity',
    ({ after }) => Expr.lte(after.reserved, after.quantity),
    {
      message: 'Reserved stock cannot exceed the quantity',
      path: ['reserved'],
    },
  ),
  Entity.invariant('noteGiven', ({ after }) => Expr.not(Expr.eq(after.note, 'nothing')), {
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
    expect(Both.field(model, 'reserved')).toEqual({
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

describe('An invariant failure the person mends', () => {
  const failed = () => both('3', '5')
  const then = (messages: ReadonlyArray<typeof Both.Message.Type>) =>
    messages.reduce(
      (state: { readonly model: typeof Both.initial; readonly outMessage?: unknown }, message) =>
        Both.bundle.update(state.model, message, undefined),
      { model: failed().model },
    )

  it('submits once a key the path does not name mends it', () => {
    const { model, outMessage } = then([
      Both.Message.Changed({ key: 'quantity', value: '10' }),
      Both.Message.Submitted(),
    ])
    expect(outMessage).toEqual({ _tag: 'Submitted', value: { quantity: 10, reserved: 5 } })
    expect(Both.field(model, 'reserved')._tag).toBe('Valid')
  })

  it('stops showing on any edit, and the submit after it judges again', () => {
    const edited = then([Both.Message.Changed({ key: 'quantity', value: '4' })]).model
    expect(Both.field(edited, 'reserved')._tag).toBe('Valid')
    expect(Both.attempted(edited)).toBe(true)
    const again = Both.bundle.update(edited, Both.Message.Submitted(), undefined)
    expect(again.outMessage).toBeUndefined()
    expect(Both.field(again.model, 'reserved')).toEqual({
      _tag: 'Invalid',
      value: '5',
      errors: ['Reserved stock cannot exceed the quantity'],
    })
  })

  it('stays through a blur, which judges nothing', () => {
    const { model } = then([Both.Message.Blurred({ key: 'quantity' })])
    expect(Both.field(model, 'reserved')._tag).toBe('Invalid')
  })

  it('shows every failure on one key, not only the last', () => {
    const Pair = Entity.define(
      'Pair',
      Schema.Struct({ id: Schema.String, a: Schema.Number, b: Schema.Number }),
    ).pipe(
      Entity.invariant('a1', ({ after }) => Expr.lte(after.a, after.b), {
        message: 'A1',
        path: ['a'],
      }),
      Entity.invariant('a2', ({ after }) => Expr.lte(after.a, 0), { message: 'A2', path: ['a'] }),
    )
    const PairForm = Form.make(
      'PairForm',
      Entity.input(Pair, Schema.Struct({ a: Schema.Number, b: Schema.Number })),
    )
    const { model } = after(PairForm.bundle, [
      PairForm.Message.Changed({ key: 'a', value: '5' }),
      PairForm.Message.Changed({ key: 'b', value: '1' }),
      PairForm.Message.Submitted(),
    ])
    expect(PairForm.field(model, 'a')).toMatchObject({ _tag: 'Invalid', errors: ['A1', 'A2'] })
  })
})

describe('A form over an invariant calling an operator', () => {
  const blank = Expr.operator('acme.blank', { input: [Schema.String], output: Schema.Boolean })
  const Note = Entity.define(
    'Note',
    Schema.Struct({ id: Schema.String, body: Schema.String }),
  ).pipe(
    Entity.invariant('bodyGiven', ({ after }) => Expr.not(blank(after.body)), {
      message: 'Write something',
      path: ['body'],
    }),
  )
  const Edit = Entity.input(Note, Schema.Struct({ body: Schema.String }))

  it('judges it with the table it is given', () => {
    const Given = Form.make('Given', Edit, {
      operators: Operators.memory(Operators.implement(blank, body => body.trim() === '')),
    })
    const { model, outMessage } = after(Given.bundle, [
      Given.Message.Changed({ key: 'body', value: '   ' }),
      Given.Message.Submitted(),
    ])
    expect(outMessage).toBeUndefined()
    expect(Given.field(model, 'body')).toMatchObject({
      _tag: 'Invalid',
      errors: ['Write something'],
    })
  })

  it('leaves it to the server without one, as it does a field it does not set', () => {
    const Bare = Form.make('Bare', Edit)
    const { outMessage } = after(Bare.bundle, [
      Bare.Message.Changed({ key: 'body', value: '   ' }),
      Bare.Message.Submitted(),
    ])
    expect(outMessage).toBeDefined()
  })
})
