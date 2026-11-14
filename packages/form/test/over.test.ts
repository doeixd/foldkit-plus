/**
 * A form over the row it edits (#542): the Entity's invariants are judged over
 * the row with the form's values laid over it, transitions too, as each key is
 * edited (#192's timing) and on a submit. A form with no row judges as before.
 */
import { Option, Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Form } from '../src/index.js'

const Quote = Entity.define(
  'Quote',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'confirmed']),
    discountPct: Schema.Number,
    approvedBy: Schema.NullOr(Schema.String),
    note: Schema.String,
  }),
).pipe(
  Entity.invariant(
    'discountNeedsApproval',
    ({ after }) => Expr.or(Expr.lte(after.discountPct, 15), Expr.isNotNull(after.approvedBy)),
    { message: 'A discount over 15% needs an approval', path: ['discountPct'] },
  ),
  Entity.invariant(
    'confirmedPriceIsFixed',
    ({ before, after }) =>
      Expr.or(Expr.eq(before.status, 'draft'), Expr.eq(after.discountPct, before.discountPct)),
    { message: "A confirmed quote's price is fixed", path: ['discountPct'] },
  ),
)

const Rep = Form.make(
  'Rep',
  Entity.input(Quote, Schema.Struct({ id: Schema.String, discountPct: Schema.Number })),
)
const Manager = Form.make(
  'Manager',
  Entity.input(
    Quote,
    Schema.Struct({
      id: Schema.String,
      discountPct: Schema.Number,
      approvedBy: Schema.NullOr(Schema.String),
    }),
  ),
)
const Notes = Form.make(
  'Notes',
  Entity.input(Quote, Schema.Struct({ id: Schema.String, note: Schema.String })),
)

const draft = { id: 'q1', status: 'draft', discountPct: 10, approvedBy: null, note: '' }
const confirmed = { ...draft, status: 'confirmed' }

type RepModel = typeof Rep.initial
/** The rep's form filled from `row` and set over it, as an editor opens one. */
const repOver = (row: Readonly<Record<string, unknown>>): RepModel =>
  Rep.over(Rep.fill(Rep.initial, { id: 'q1', discountPct: row.discountPct as number }).model, row)
    .model
const run = <Model, Message>(
  form: {
    readonly bundle: {
      readonly update: (
        model: Model,
        message: Message,
        flags: undefined,
      ) => { readonly model: Model; readonly outMessage?: unknown }
    }
  },
  model: Model,
  messages: ReadonlyArray<Message>,
): { readonly model: Model; readonly outMessage?: unknown } =>
  messages.reduce<{ readonly model: Model; readonly outMessage?: unknown }>(
    (state, message) => form.bundle.update(state.model, message, undefined),
    { model },
  )

describe('A form over the row it edits', () => {
  it('shows a rule over a field it does not set as the key is typed', () => {
    const { model, outMessage } = run(Rep, repOver(draft), [
      Rep.Message.Changed({ key: 'discountPct', value: '20' }),
    ])
    expect(outMessage).toBeUndefined()
    expect(Rep.field(model, 'discountPct')).toEqual({
      _tag: 'Invalid',
      value: '20',
      errors: ['A discount over 15% needs an approval'],
    })
    // Submitting it again changes nothing: the same value is judged the same.
    expect(run(Rep, model, [Rep.Message.Submitted()]).outMessage).toBeUndefined()
  })

  it('judges the change from the row: a transition invariant', () => {
    const { model } = run(Rep, repOver(confirmed), [
      Rep.Message.Changed({ key: 'discountPct', value: '12' }),
    ])
    expect(Rep.field(model, 'discountPct')).toMatchObject({
      _tag: 'Invalid',
      errors: ["A confirmed quote's price is fixed"],
    })
    const kept = run(Rep, repOver(confirmed), [
      Rep.Message.Changed({ key: 'discountPct', value: '10' }),
      Rep.Message.Submitted(),
    ])
    expect(kept.outMessage).toEqual({ _tag: 'Submitted', value: { id: 'q1', discountPct: 10 } })
  })

  it('submits a value that holds over the row', () => {
    const { outMessage } = run(Rep, repOver({ ...draft, approvedBy: 'ada' }), [
      Rep.Message.Changed({ key: 'discountPct', value: '20' }),
      Rep.Message.Submitted(),
    ])
    expect(outMessage).toEqual({ _tag: 'Submitted', value: { id: 'q1', discountPct: 20 } })
  })

  it('decides nothing over a field the row does not hold either', () => {
    const { approvedBy: _, ...partial } = draft
    const { model, outMessage } = run(Rep, repOver(partial), [
      Rep.Message.Changed({ key: 'discountPct', value: '20' }),
      Rep.Message.Submitted(),
    ])
    expect(Rep.field(model, 'discountPct')._tag).toBe('Valid')
    expect(outMessage).toMatchObject({ _tag: 'Submitted' })
  })

  it('judges as before with no row: nothing on an edit, and the server decides', () => {
    const { model } = run(Rep, Rep.initial, [
      Rep.Message.Changed({ key: 'id', value: 'q1' }),
      Rep.Message.Changed({ key: 'discountPct', value: '20' }),
    ])
    expect(Rep.field(model, 'discountPct')._tag).toBe('Valid')
    expect(run(Rep, model, [Rep.Message.Submitted()]).outMessage).toMatchObject({
      _tag: 'Submitted',
    })
  })

  it('judges nothing on a blur', () => {
    const typed = run(Rep, repOver({ ...draft, approvedBy: 'ada' }), [
      Rep.Message.Changed({ key: 'discountPct', value: '20' }),
    ]).model
    // The row the form is over loses its approval; nothing the person did says so yet.
    const moved = Rep.over(typed, draft).model
    const { model } = run(Rep, moved, [Rep.Message.Blurred({ key: 'discountPct' })])
    expect(model).toBe(moved)
    expect(Rep.field(model, 'discountPct')._tag).toBe('Valid')
  })

  it('waits until every key of the form that sets a field the rule reads is reached', () => {
    const opened = Manager.over(
      Manager.fill(Manager.initial, { id: 'q1', discountPct: 10, approvedBy: null }).model,
      draft,
    ).model
    const typed = run(Manager, opened, [
      Manager.Message.Changed({ key: 'discountPct', value: '20' }),
    ]).model
    expect(Manager.field(typed, 'discountPct')._tag).toBe('Valid')
    const reached = run(Manager, typed, [
      Manager.Message.Changed({ key: 'approvedBy', value: 'x' }),
      Manager.Message.Changed({ key: 'approvedBy', value: '' }),
    ]).model
    expect(Manager.field(reached, 'discountPct')).toMatchObject({
      _tag: 'Invalid',
      errors: ['A discount over 15% needs an approval'],
    })
    // A submit shows every failure, reached or not.
    const submitted = run(Manager, typed, [Manager.Message.Submitted()])
    expect(submitted.outMessage).toBeUndefined()
    expect(Manager.field(submitted.model, 'discountPct')._tag).toBe('Invalid')
  })

  it('counts a key filled again as not reached', () => {
    const opened = Manager.over(
      Manager.fill(Manager.initial, { id: 'q1', discountPct: 10, approvedBy: null }).model,
      draft,
    ).model
    const typed = run(Manager, opened, [
      Manager.Message.Changed({ key: 'discountPct', value: '20' }),
    ]).model
    const refilled = Manager.fill(typed, { discountPct: 20 }).model
    const { model } = run(Manager, refilled, [
      Manager.Message.Changed({ key: 'approvedBy', value: 'x' }),
      Manager.Message.Changed({ key: 'approvedBy', value: '' }),
    ])
    expect(Manager.field(model, 'discountPct')._tag).toBe('NotValidated')
    expect(model.marks).toEqual({})
  })

  it('does not show on an edit a rule the form sets nothing of', () => {
    const opened = Notes.over(Notes.fill(Notes.initial, { id: 'q1', note: '' }).model, {
      ...draft,
      discountPct: 20,
    }).model
    const { model } = run(Notes, opened, [Notes.Message.Changed({ key: 'note', value: 'hi' })])
    expect(model.errors).toEqual([])
    // A submit says it: the row it would write breaks it.
    expect(run(Notes, model, [Notes.Message.Submitted()]).model.errors).toEqual([
      'A discount over 15% needs an approval',
    ])
  })

  it('keeps the row through a fill and drops it on a reset', () => {
    const opened = repOver(draft)
    expect(Rep.fill(opened, { discountPct: 12 }).model.over).toEqual(Option.some(draft))
    expect(run(Rep, opened, [Rep.Message.Reset()]).model.over).toEqual(Option.none())
  })
})

describe("A form's stored Model", () => {
  const codec = Rep.bundle.Model as unknown as Schema.Codec<RepModel, unknown>

  it('decodes one stored before the row was kept, as a form over no row', () => {
    const {
      over: _,
      reached: __,
      ...stored
    } = Schema.encodeSync(codec)(Rep.initial) as Record<string, unknown>
    const decoded = Schema.decodeUnknownSync(codec)(stored)
    expect(decoded.over).toEqual(Option.none())
    expect(decoded.reached).toEqual({})
  })

  it('stores the row as plain data and reads it back', () => {
    const stored = Schema.encodeSync(codec)(repOver(draft)) as Record<string, unknown>
    expect(stored.over).toEqual(draft)
    expect(Schema.decodeUnknownSync(codec)(JSON.parse(JSON.stringify(stored))).over).toEqual(
      Option.some(draft),
    )
  })
})
