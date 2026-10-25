/**
 * Invariants: declared once on an Entity, judged over a whole stored row, and
 * read as a Schema check.
 */
import { Option, Schema, SchemaGetter } from 'effect'
import { describe, expect, it } from 'vitest'
import { assertSupported, Collation, Entity, Expr, Query, truthOver } from '../src/index.js'

/** A date the store keeps as ISO text, so an invariant over it compares the text. */
const Day = Schema.Date.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.transform((iso: string) => new Date(iso)),
    encode: SchemaGetter.transform((at: Date) => at.toISOString()),
  }),
)

const InventoryFields = Entity.define(
  'Inventory',
  Schema.Struct({
    id: Schema.String,
    quantity: Schema.Number,
    reserved: Schema.NullOr(Schema.Number),
    starts: Day,
    ends: Day,
  }),
)
const Inventory = InventoryFields.pipe(
  Entity.invariant(
    'reservedWithinQuantity',
    ({ after }) => Expr.lte(after.reserved, after.quantity),
    {
      message: 'Reserved stock cannot exceed the quantity',
      path: ['reserved'],
    },
  ),
  Entity.invariant(
    'endsAfterStart',
    ({ after }) => Expr.lte(after.starts, after.ends, { collation: Collation.binary }),
    {
      message: 'It ends before it starts',
    },
  ),
)
const Other = Entity.define('Other', Schema.Struct({ id: Schema.String, size: Schema.Number }))

const row = {
  id: 'i1',
  quantity: 10,
  reserved: 5,
  starts: '2026-01-01T00:00:00.000Z',
  ends: '2026-02-01T00:00:00.000Z',
}
/** What an invalid row's judgement holds: exactly these invariants, failing. */
const failing = (...ids: ReadonlyArray<string>) => ({
  _tag: 'Invalid',
  failures: ids.map(id => expect.objectContaining({ id })),
})

describe('An invariant', () => {
  it('judges the whole row: valid, or each that fails', () => {
    expect(Entity.judge(Inventory, { after: row })).toEqual({ _tag: 'Valid' })
    // A patch valid on its own (3 is a number) that leaves an invalid row.
    expect(Entity.judge(Inventory, { after: { ...row, quantity: 3 } })).toEqual(
      failing('reservedWithinQuantity'),
    )
    // Over the stored text of a date: ending in December before a January start fails.
    expect(
      Entity.judge(Inventory, { after: { ...row, quantity: 3, ends: '2025-12-01T00:00:00.000Z' } }),
    ).toEqual(failing('reservedWithinQuantity', 'endsAfterStart'))
  })

  it('fails on a null, as a WHERE drops the row SQL cannot call true', () => {
    expect(Entity.judge(Inventory, { after: { ...row, reserved: null } })).toEqual(
      failing('reservedWithinQuantity'),
    )
  })

  it('leaves a row without a field it reads undecided, never valid', () => {
    const { quantity: _, ...partial } = row
    expect(Entity.judge(Inventory, { after: partial })).toEqual({
      _tag: 'Undecided',
      fields: ['quantity'],
    })
    // A failure it can decide still decides.
    expect(
      Entity.judge(Inventory, { after: { ...partial, ends: '2025-12-01T00:00:00.000Z' } }),
    ).toEqual(failing('endsAfterStart'))
  })

  it('is metadata: attaching adds to what is there, and the Entity is the same', () => {
    expect(Entity.invariants(Inventory).map(held => held.id)).toEqual([
      'reservedWithinQuantity',
      'endsAfterStart',
    ])
    expect(Entity.invariants(InventoryFields)).toEqual([])
    expect(Entity.same(Inventory, InventoryFields)).toBe(true)
    expect(Entity.invariants(Inventory)[1]?.path).toEqual(['starts', 'ends'])
    // The same invariants reached twice, as when two annotated copies combine, are held once.
    expect(Entity.invariants(Inventory.pipe(Entity.annotate(Inventory.metadata)))).toHaveLength(2)
  })

  it.each([
    [
      'an id declared twice',
      () =>
        Inventory.pipe(
          Entity.invariant('endsAfterStart', ({ after }) => Expr.gte(after.quantity, 0), {
            message: 'x',
          }),
        ),
      'declared twice',
    ],
    [
      'a predicate over another Entity',
      () =>
        InventoryFields.pipe(
          Entity.invariant('other', () => Expr.gte(Other.fields.size, 0) as never, {
            message: 'x',
          }),
        ),
      'Other',
    ],
    [
      'a predicate reading an input',
      () =>
        InventoryFields.pipe(
          Entity.invariant(
            'input',
            ({ after }) => Expr.gte(after.quantity, Expr.input('least', Schema.Number)),
            {
              message: 'x',
            },
          ),
        ),
      'reads the input least',
    ],
    [
      'a predicate reading only the row before, a precondition',
      () =>
        InventoryFields.pipe(
          Entity.invariant('before', ({ before }) => Expr.gte(before.quantity, 0), {
            message: 'x',
          }),
        ),
      'reads no field of `after`',
    ],
    [
      // The stored fields read the row before: an invariant reads the row after through `after`.
      'a predicate over the stored fields alone',
      () =>
        InventoryFields.pipe(
          Entity.invariant('stored', () => Expr.gte(InventoryFields.fields.quantity, 0), {
            message: 'x',
          }),
        ),
      'reads no field of `after`',
    ],
    [
      'a path naming no field',
      () =>
        InventoryFields.pipe(
          Entity.invariant('path', ({ after }) => Expr.gte(after.quantity, 0), {
            message: 'x',
            // @ts-expect-error: not a field of the Entity
            path: ['volume'],
          }),
        ),
      'not a field',
    ],
  ])('is refused where it is declared: %s', (_, declare, message) => {
    expect(declare).toThrow(message)
  })
})

describe('Entity.check', () => {
  const Stored = InventoryFields.schema.check(Entity.check(Inventory))
  const decoded = Schema.decodeUnknownSync(InventoryFields.schema)(row)

  it('passes a valid row, and fails an invalid one at its path with its message', () => {
    expect(Schema.decodeUnknownSync(Stored)(row)).toEqual(decoded)
    expect(() => Schema.decodeUnknownSync(Stored)({ ...row, quantity: 3 })).toThrow(
      /Reserved stock cannot exceed the quantity[\s\S]*reserved|reserved[\s\S]*Reserved stock cannot exceed the quantity/,
    )
  })

  it('judges a decoded value by its stored form', () => {
    expect(Schema.is(Stored)(decoded)).toBe(true)
    expect(Schema.is(Stored)({ ...decoded, ends: new Date('2025-12-01') })).toBe(false)
  })
})

describe('Expr.substituteNext', () => {
  const Item = Entity.define(
    'Item',
    Schema.Struct({ id: Schema.String, name: Schema.String, size: Schema.NullOr(Schema.Number) }),
  )
  const name = Expr.next(Item.fields.name)
  const size = Expr.next(Item.fields.size)
  const after = { id: 'i1', name: 'Bolt', size: 3 }
  // Each holds of the row after and not once `values` replace what it reads.
  it.each([
    ['eq', Expr.eq(name, 'Bolt'), { name: 'Nut' }],
    ['isNull', Expr.isNotNull(size), { size: null }],
    ['contains', Expr.contains(name, 'ol'), { name: 'Nut' }],
    ['in', Expr.in(size, [3, 4]), { size: 5 }],
    ['and', Expr.and(Expr.eq(name, 'Bolt'), Expr.isNotNull(size)), { size: null }],
    ['or', Expr.or(Expr.eq(name, 'Bolt'), Expr.isNull(size)), { name: 'Nut' }],
    ['not', Expr.not(Expr.eq(name, 'Nut')), { name: 'Nut' }],
    ['compare', Expr.gte(size, 2), { size: 1 }],
  ])('reads a value given for what %s reads after', (_, predicate, values) => {
    expect(truthOver(predicate, {}, {}, after)).toBe(true)
    expect(truthOver(Expr.substituteNext(predicate, values), {}, {}, after)).toBe(false)
    // A field it names but does not read changes nothing.
    expect(truthOver(Expr.substituteNext(predicate, { id: 'other' }), {}, {}, after)).toBe(true)
  })

  it('is refused by a query, which reads stored rows and no row after', () => {
    expect(() =>
      assertSupported(Query.from(Item).pipe(Query.where(Expr.eq(name, 'Bolt')))),
    ).toThrow('does not run next')
  })

  it('leaves a field as stored alone: only the row after is substituted', () => {
    const stored = Expr.eq(Item.fields.name, 'Bolt')
    expect(truthOver(Expr.substituteNext(stored, { name: 'Nut' }), after)).toBe(true)
  })
})

describe('Entity.judgeInput', () => {
  const Edit = Entity.input(
    Inventory,
    Schema.Struct({
      quantity: Schema.Number,
      reserved: Schema.Option(Schema.NullOr(Schema.Number)),
      starts: Day,
      ends: Day,
      note: Schema.String,
    }),
    { note: Entity.unmapped },
  )
  const value = {
    quantity: 3,
    reserved: Option.some(5),
    starts: new Date('2026-01-01'),
    ends: new Date('2026-02-01'),
    note: 'x',
  }

  it('judges the row an input describes, its values encoded as the store holds them', () => {
    expect(Entity.judgeInput(Edit, value)).toEqual(failing('reservedWithinQuantity'))
    expect(Entity.judgeInput(Edit, { ...value, quantity: 5 })).toEqual({ _tag: 'Valid' })
    expect(
      Entity.judgeInput(Edit, { ...value, quantity: 5, ends: new Date('2025-12-01') }),
    ).toEqual(failing('endsAfterStart'))
  })

  it('leaves an invariant over a key holding nothing undecided', () => {
    expect(Entity.judgeInput(Edit, { ...value, reserved: Option.none() })).toEqual({
      _tag: 'Undecided',
      fields: ['reserved'],
    })
  })
})
