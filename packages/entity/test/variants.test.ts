/**
 * Variants of an Entity (#357): the stored row every interpreter reads, the
 * union the cases make, the invariant per case that joins them, and `Expr.is`
 * narrowing to a case, over the row and through a relation.
 */
import { Option, Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import {
  Collation,
  Derived,
  Entity,
  Expr,
  Held,
  Judge,
  Query,
  Relation,
  evaluate,
  type Predicate,
} from '../src/index.js'
import { Variant, variantCases, variantRows } from '../src/conformance/index.js'

const Name = Schema.String
const Price = Schema.Finite
const Note = Schema.OptionFromNullOr(Schema.String)

const domains = () =>
  Entity.defineVariants('Domain', {
    Available: { id: Schema.String, name: Name, price: Price, note: Note },
    Unconfirmed: { id: Schema.String, name: Name },
  })

const rows = [
  { _tag: 'Available', id: 'a', name: 'a.dev', price: 5, note: null },
  { _tag: 'Available', id: 'b', name: 'b.dev', price: 30, note: 'premium' },
  { _tag: 'Unconfirmed', id: 'c', name: 'c.dev', price: null, note: null },
]

const ids = (entity: ReturnType<typeof domains>, predicate: Predicate): ReadonlyArray<unknown> =>
  evaluate(Query.from(entity).pipe(Query.where(predicate)), {}, rows).map(row => row.id)

describe('the stored row', () => {
  it('is _tag, the shared fields as declared, and each case field nullable', () => {
    const Domain = domains()
    expect(Object.keys(Domain.fields)).toEqual(['_tag', 'id', 'name', 'price', 'note'])
    expect(Domain.fields.name.schema).toBe(Name)
    const decode = Schema.decodeUnknownSync(Domain.schema)
    expect(decode({ _tag: 'Unconfirmed', id: 'c', name: 'c', price: null, note: null })).toEqual({
      _tag: 'Unconfirmed',
      id: 'c',
      name: 'c',
      price: null,
      note: Option.none(),
    })
    expect(() => decode({ ...rows[0], _tag: 'Taken' })).toThrow()
  })

  it('keeps a case field whose stored form holds null already as declared', () => {
    expect(domains().fields.note.schema).toBe(Note)
  })

  it('shares a key between some cases as one field those cases require', () => {
    const Listing = Entity.defineVariants('Listing', {
      Sold: { id: Schema.String, price: Price },
      Offered: { id: Schema.String, price: Price },
      Withdrawn: { id: Schema.String },
    })
    expect(
      Entity.judge(Listing, { after: { _tag: 'Offered', id: 'x', price: null } }),
    ).toMatchObject({ _tag: 'Invalid', failures: [{ id: 'variant_Offered' }] })
    expect(Entity.judge(Listing, { after: { _tag: 'Sold', id: 'x', price: 3 } })._tag).toBe('Valid')
  })
})

describe('the union', () => {
  it('is Effect’s tagged union of the cases, with its own match', () => {
    const Domain = domains()
    const row = Domain.variants.cases.Available.make({
      id: 'a',
      name: 'a',
      price: 5,
      note: Option.none(),
    })
    expect(
      Domain.variants.match(row, { Available: ({ price }) => price, Unconfirmed: () => 0 }),
    ).toBe(5)
  })

  it('decodes a stored row to its case, and encodes a case with null for the others', () => {
    const Domain = domains()
    const { stored } = Option.getOrThrow(Entity.variantsOf(Domain))
    expect(Schema.decodeUnknownSync(stored)(rows[2])).toEqual({
      _tag: 'Unconfirmed',
      id: 'c',
      name: 'c.dev',
    })
    expect(Schema.decodeUnknownSync(stored)(rows[1])).toEqual({
      _tag: 'Available',
      id: 'b',
      name: 'b.dev',
      price: 30,
      note: Option.some('premium'),
    })
    expect(Schema.encodeSync(stored)({ _tag: 'Unconfirmed', id: 'c', name: 'c.dev' })).toEqual(
      rows[2],
    )
  })

  it('refuses a stored row holding another case’s field, and one missing its own', () => {
    const { stored } = Option.getOrThrow(Entity.variantsOf(domains()))
    expect(() => Schema.decodeUnknownSync(stored)({ ...rows[2], price: 3 })).toThrow(
      'a row that is Unconfirmed holds price, which only another case has',
    )
    expect(() => Schema.decodeUnknownSync(stored)({ ...rows[0], price: null })).toThrow()
  })

  it('is none for an Entity of one shape', () => {
    const Plain = Entity.define('Plain', Schema.Struct({ id: Schema.String }))
    expect(Option.isNone(Entity.variantsOf(Plain))).toBe(true)
    expect('variants' in Plain).toBe(false)
  })

  it('is on every descriptor of the Entity: annotated, related, a relation’s target', () => {
    const Domain = domains()
    const Order = Entity.define('Order', Schema.Struct({ id: Schema.String }))
    const Shop = Entity.relate({ Domain, Order }, { Order: { domain: Relation.one(Domain) } })
    const Labelled = Shop.Domain.pipe(Entity.annotate(Metadata.empty))
    expect(Shop.Order.relations.domain.target().variants).toBe(Domain.variants)
    expect(Labelled.variants).toBe(Domain.variants)
    const Counted = Shop.Domain.pipe(
      Entity.derived({ orders: Derived.count(Shop.Order.relations.domain) }),
    )
    expect(Counted.variants).toBe(Domain.variants)
  })
})

describe('refused where declared', () => {
  it.each([
    ['one case', { Only: { id: Schema.String } }, 'two cases or more'],
    ['a case declaring _tag', { A: { _tag: Schema.String }, B: {} }, 'declares _tag'],
    [
      'a key with two schemas',
      { A: { price: Schema.Finite }, B: { price: Schema.Finite.check(Schema.isInt()) } },
      'different schemas',
    ],
    ['an optional key', { A: { note: Schema.optionalKey(Schema.String) }, B: {} }, 'optional key'],
  ])('%s', (_, cases, message) => {
    expect(() => Entity.defineVariants('Bad', cases as never)).toThrow(message)
  })
})

describe('the invariant per case', () => {
  it('requires a case’s own fields and refuses another’s', () => {
    const Domain = domains()
    expect(Entity.invariants(Domain).map(held => [held.id, held.message])).toEqual([
      ['variant_Available', 'A Domain that is Available holds price'],
      ['variant_Unconfirmed', 'A Domain that is Unconfirmed holds none of price, note'],
    ])
    for (const row of rows) expect(Entity.judge(Domain, { after: row })._tag).toBe('Valid')
    expect(Entity.judge(Domain, { after: { ...rows[0], price: null } })).toMatchObject({
      _tag: 'Invalid',
      failures: [{ id: 'variant_Available' }],
    })
    expect(Entity.judge(Domain, { after: { ...rows[2], note: 'x' } })).toMatchObject({
      _tag: 'Invalid',
      failures: [{ id: 'variant_Unconfirmed' }],
    })
  })

  it('is not declared for a case that has nothing to say', () => {
    const Flag = Entity.defineVariants('Flag', {
      On: { id: Schema.String },
      Off: { id: Schema.String },
    })
    expect(Entity.invariants(Flag)).toEqual([])
  })
})

describe('Expr.is', () => {
  it('matches the rows of a case', () => {
    const Domain = domains()
    expect(ids(Domain, Expr.is(Domain, 'Available'))).toEqual(['a', 'b'])
    expect(ids(Domain, Expr.is(Domain, 'Unconfirmed'))).toEqual(['c'])
  })

  it('asks of a case’s fields, and is false, not unknown, on another case', () => {
    const Domain = domains()
    const cheap = Expr.is(Domain, 'Available', ({ price }) => Expr.lt(price, 20))
    expect(ids(Domain, cheap)).toEqual(['a'])
    expect(ids(Domain, Expr.not(cheap))).toEqual(['b', 'c'])
    // Over the stored field, another case's null is unknown and drops out of both.
    expect(ids(Domain, Expr.not(Expr.lt(Domain.fields.price, 20)))).toEqual(['b'])
  })

  it('hands out the case’s field typed as the case holds it, keeping its metadata', () => {
    const Domain = domains().pipe(Entity.annotateMembers({ name: Collation.of(Collation.binary) }))
    let seen: unknown
    Expr.is(Domain, 'Available', fields => {
      seen = fields
      return Expr.isNotNull(fields.price)
    })
    const fields = seen as typeof Domain.fields
    expect(fields.price.schema).toBe(Price)
    expect(fields.name.metadata).toBe(Domain.fields.name.metadata)
    expect(Object.keys(fields)).toEqual(['id', 'name', 'price', 'note'])
  })

  it('reads the case of the row a one relation reaches', () => {
    const Domain = domains()
    const Order = Entity.define('Order', Schema.Struct({ id: Schema.String }))
    const Shop = Entity.relate(
      { Domain, Order },
      { Order: { domain: Relation.one(Domain, { optional: true }) } },
    )
    const orders = [
      { id: 'o1', domain: 'a' },
      { id: 'o2', domain: 'b' },
      { id: 'o3', domain: 'c' },
      { id: 'o4', domain: null },
    ]
    const cheap = Expr.is(Shop.Order.relations.domain, 'Available', ({ price }) =>
      Expr.lt(price, 20),
    )
    const held = Held.rows([
      { entity: Shop.Order, rows: orders },
      { entity: Shop.Domain, rows },
    ])
    const known = (truth: boolean) => ({ _tag: 'Known', truth })
    const truths = (predicate: Predicate) =>
      orders.map(order => {
        const verdict: unknown = Judge.query(
          Query.from(Shop.Order).pipe(Query.where(predicate)),
          {},
          Option.getOrThrow(held.row(Shop.Order, order.id)),
          { rows: held },
        )
        return verdict
      })
    // A null link reaches no row: unknown, so neither the test nor its `not` holds it.
    expect(truths(cheap)).toEqual([true, false, false, false].map(known))
    expect(truths(Expr.not(cheap))).toEqual([false, true, true, false].map(known))
  })

  it('refuses an Entity of one shape, a case it does not have, and a non-predicate', () => {
    const Domain = domains()
    const Plain = Entity.define('Plain', Schema.Struct({ id: Schema.String }))
    expect(() => Expr.is(Plain as never, 'A' as never)).toThrow('Entity.defineVariants')
    expect(() => Expr.is(Domain, 'Taken' as never)).toThrow('its cases are Available, Unconfirmed')
    expect(() => Expr.is(Domain, 'Available', ({ price }) => price as never)).toThrow(
      'is a predicate',
    )
  })
})

describe('the conformance set', () => {
  it.each(variantCases.map(c => [c.what, c] as const))('%s', (_, { body, input, expected }) => {
    expect(evaluate(body, input, variantRows).map(row => row.id)).toEqual(expected)
  })

  it('holds only valid rows of its Entity', () => {
    for (const row of variantRows) expect(Entity.judge(Variant, { after: row })._tag).toBe('Valid')
  })
})
