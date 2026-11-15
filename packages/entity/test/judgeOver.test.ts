/**
 * An input judged over the row it edits (#542): the row's fields fill what the
 * input does not set, and the row is the one before, so a transition is judged.
 * `rowFrom` gives that row from a read value; `judgedBy` says what to read.
 */
import { Schema, SchemaGetter } from 'effect'
import { Entity, Expr, Relation } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'

const Day = Schema.Date.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.transform((iso: string) => new Date(iso)),
    encode: SchemaGetter.transform((at: Date) => at.toISOString()),
  }),
)
const CustomerFields = Entity.define('Customer', Schema.Struct({ id: Schema.String }))
const QuoteFields = Entity.define(
  'Quote',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'confirmed']),
    discountPct: Schema.Number,
    approvedBy: Schema.NullOr(Schema.String),
    note: Schema.String,
    sent: Day,
  }),
)
const Linked = Entity.relate(
  { Quote: QuoteFields, Customer: CustomerFields },
  { Quote: { customer: Relation.one(CustomerFields, { optional: true }) } },
)
const Quote = Linked.Quote.pipe(
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
const EditInput = Entity.input(
  Quote,
  Schema.Struct({ id: Schema.String, discountPct: Schema.Number }),
)
const NoteInput = Entity.input(Quote, Schema.Struct({ id: Schema.String, note: Schema.String }))

const draft = { id: 'q1', status: 'draft', discountPct: 10, approvedBy: null }
const confirmed = { ...draft, status: 'confirmed' }
const tagOf = (judged: ReturnType<typeof Entity.judgeInput>) => judged._tag

describe('Entity.judgeInput over a row', () => {
  it('judges a field the input does not set as the row holds it', () => {
    expect(Entity.judgeInput(EditInput, { id: 'q1', discountPct: 20 })).toEqual({
      _tag: 'Undecided',
      fields: ['approvedBy'],
      operators: [],
    })
    const judged = Entity.judgeInput(EditInput, { id: 'q1', discountPct: 20 }, { over: draft })
    expect(judged).toMatchObject({
      _tag: 'Invalid',
      failures: [{ id: 'discountNeedsApproval' }],
    })
    expect(
      tagOf(
        Entity.judgeInput(
          EditInput,
          { id: 'q1', discountPct: 20 },
          { over: { ...draft, approvedBy: 'ada' } },
        ),
      ),
    ).toBe('Valid')
  })

  it('judges the change from the row, so a transition invariant is judged', () => {
    const judged = Entity.judgeInput(EditInput, { id: 'q1', discountPct: 12 }, { over: confirmed })
    expect(judged).toMatchObject({ _tag: 'Invalid', failures: [{ id: 'confirmedPriceIsFixed' }] })
    expect(
      tagOf(Entity.judgeInput(EditInput, { id: 'q1', discountPct: 12 }, { over: draft })),
    ).toBe('Valid')
  })

  it('leaves undecided what the row does not hold either', () => {
    const { approvedBy: _, ...partial } = draft
    expect(Entity.judgeInput(EditInput, { id: 'q1', discountPct: 20 }, { over: partial })).toEqual({
      _tag: 'Undecided',
      fields: ['approvedBy'],
      operators: [],
    })
  })
})

describe('Entity.rowFrom', () => {
  it('encodes each field a value holds, and a one relation as its id', () => {
    const row = Entity.rowFrom(Quote, {
      id: 'q1',
      sent: new Date('2026-01-02T00:00:00.000Z'),
      customer: { entity: 'Customer', id: 'c1' },
    })
    expect(row).toEqual({ id: 'q1', sent: '2026-01-02T00:00:00.000Z', customer: 'c1' })
    expect(Entity.rowFrom(Quote, { customer: null })).toEqual({ customer: null })
  })
})

describe('Entity.judgedBy', () => {
  it('names what an invariant over a key the input sets reads beside it', () => {
    expect(Entity.judgedBy(EditInput)).toEqual({ approvedBy: true, status: true })
  })

  it('names nothing for an input no invariant reads', () => {
    expect(Entity.judgedBy(NoteInput)).toEqual({})
  })

  it('loads with the input what decides its invariants over the row', () => {
    const selection = Entity.selectFor(EditInput, { also: Entity.judgedBy(EditInput) })
    const read = Schema.decodeUnknownSync(selection.schema)(confirmed)
    const over = Entity.rowFrom(Quote, read as Readonly<Record<string, unknown>>)
    expect(Entity.judgeInput(EditInput, { id: 'q1', discountPct: 20 }, { over })).toMatchObject({
      _tag: 'Invalid',
      failures: [{ id: 'discountNeedsApproval' }, { id: 'confirmedPriceIsFixed' }],
    })
  })
})
