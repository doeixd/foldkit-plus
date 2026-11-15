/**
 * Refinements: a named state of an Entity's row, as a value, and a write's
 * `from` and `becomes` over one.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Query, Relation, Write, evaluate } from '../src/index.js'

const Shelf = Entity.define('Shelf', Schema.Struct({ id: Schema.String, open: Schema.Boolean }))
const Base = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.Literals(['draft', 'published', 'archived']),
    featured: Schema.Boolean,
    stock: Schema.Number,
  }),
)
const Shop = Entity.relate({ Shelf, Item: Base }, { Item: { shelf: Relation.one(Shelf) } })
const Item = Shop.Item

const Draft = Entity.refine(Item, 'Draft', { status: 'draft' })
const Published = Entity.refine(Item, 'Published', { status: 'published' })
const Featured = Entity.refine(Item, 'Featured', { status: 'published', featured: true })
const InStock = Entity.refine(Item, 'InStock', ({ row }) => Expr.gt(row.stock, 0))
const OnOpenShelf = Entity.refine(Item, 'OnOpenShelf', () =>
  Expr.eq(Expr.path(Item.relations.shelf, Shelf.fields.open), true),
)

const rows = [
  { id: 'a', name: 'A', status: 'draft', featured: false, stock: 0, shelf: 's1' },
  { id: 'b', name: 'B', status: 'published', featured: true, stock: 2, shelf: 's2' },
  { id: 'c', name: 'C', status: 'archived', featured: false, stock: 5, shelf: 's1' },
]

describe('Entity.refine', () => {
  it('is declared on the Entity, so every descriptor of it lists it', () => {
    expect(Entity.states(Base).map(state => state.name)).toEqual([
      'Draft',
      'Published',
      'Featured',
      'InStock',
      'OnOpenShelf',
    ])
  })

  it('refuses a name declared twice on one Entity', () => {
    expect(() => Entity.refine(Base, 'Draft', { status: 'archived' })).toThrow(/declared twice/)
  })

  it('refuses a literal key that is no field, or a value it does not store, at run time too', () => {
    expect(() => Entity.refine(Item, 'Odd', { colour: 'red' } as never)).toThrow(/not a field/)
    expect(() => Entity.refine(Item, 'Odder', { status: 'gone' } as never)).toThrow(
      /no value "status" stores/,
    )
    expect(() => Entity.refine(Item, 'Empty', {})).toThrow(/names no field/)
  })

  it('is printed by name', () => {
    expect(Expr.show(Draft.predicate)).toBe('Item.Draft')
    expect(Expr.show(Draft.after)).toBe('next Item.Draft')
    expect(Query.show(Query.from(Featured))).toContain('Item.Featured')
  })

  it('reads the fields its form names', () => {
    expect(Featured.reads).toEqual(['status', 'featured'])
    expect(InStock.reads).toEqual(['stock'])
  })

  it('Query.from(state) holds the rows in it', () => {
    const ids = (body: Parameters<typeof evaluate>[0]) =>
      evaluate(body, {}, rows).map(row => row.id)
    expect(ids(Query.from(Draft))).toEqual(['a'])
    expect(ids(Query.from(InStock))).toEqual(['b', 'c'])
    expect(ids(Query.from(Featured))).toEqual(['b'])
  })

  it('inState judges a stored row, and is none where the row lacks a field it reads', () => {
    expect(Entity.inState(Draft, { status: 'draft' })).toEqual(Option.some(true))
    expect(Entity.inState(Draft, { status: 'published' })).toEqual(Option.some(false))
    expect(Entity.inState(Draft, { name: 'x' })).toEqual(Option.none())
    expect(Entity.inState(Featured, { status: 'published' })).toEqual(Option.none())
  })

  it('is() is true only where the row is definitely in the state', () => {
    expect(Draft.is({ status: 'draft' })).toBe(true)
    expect(Draft.is({ status: 'archived' })).toBe(false)
    expect(Draft.is({ name: 'x' })).toBe(false)
    expect(InStock.is({ stock: 3 })).toBe(true)
    expect(InStock.is({ stock: 0 })).toBe(false)
  })

  it('a state reaching another row is not local: no row after, and undecided over one row', () => {
    expect(OnOpenShelf.local).toBe(false)
    expect(() => OnOpenShelf.after).toThrow(/reaches another row/)
    expect(Entity.inState(OnOpenShelf, rows[0]!)).toEqual(Option.none())
    expect(OnOpenShelf.is(rows[0]!)).toBe(false)
    expect(Draft.local).toBe(true)
  })
})

const StatusInput = (status: 'draft' | 'published' | 'archived') =>
  Entity.input(Item, Schema.Struct({ id: Schema.String, status: Schema.Literal(status) }))

describe('a write from a state', () => {
  it('joins its predicate to the when, so another state is refused as unmet', () => {
    const Publish = Write.update(StatusInput('published'), { id: 'id', from: Draft })
    expect(Option.isSome(Publish.when)).toBe(true)
    const body = Option.getOrThrow(Publish.when)
    expect(evaluate(body, {}, rows).map(row => row.id)).toEqual(['a'])
    expect(Publish.from).toEqual(Option.some(Draft))
  })

  it('keeps a when given beside it', () => {
    const write = Write.update(StatusInput('published'), {
      id: 'id',
      from: Draft,
      when: () => Expr.gt(Item.fields.stock, 0),
    })
    const body = Option.getOrThrow(write.when)
    expect(
      evaluate(body, {}, [...rows, { ...rows[0]!, id: 'd', stock: 4 }]).map(row => row.id),
    ).toEqual(['d'])
  })

  it('refuses a state reaching another row as a from or a becomes', () => {
    expect(() => Write.update(StatusInput('published'), { id: 'id', from: OnOpenShelf })).toThrow(
      /reaches another row/,
    )
    expect(() =>
      Write.update(StatusInput('published'), { id: 'id', becomes: OnOpenShelf }),
    ).toThrow(/reaches another row/)
  })

  it('refuses a state of another Entity', () => {
    const Other = Entity.define(
      'Item',
      Schema.Struct({ id: Schema.String, status: Schema.Literals(['draft', 'published']) }),
    )
    const OtherDraft = Entity.refine(Other, 'Draft', { status: 'draft' })
    expect(() =>
      Write.update(StatusInput('published'), { id: 'id', from: OtherDraft as never }),
    ).toThrow(/another Entity/)
  })
})

describe('becomes', () => {
  it('is proved where the write is declared', () => {
    const Publish = Write.update(StatusInput('published'), {
      id: 'id',
      from: Draft,
      becomes: Published,
    })
    expect(Publish.becomes).toEqual(Option.some(Published))
  })

  it('throws where declared, naming a row, when the patch cannot keep it', () => {
    expect(() => Write.update(StatusInput('draft'), { id: 'id', becomes: Published })).toThrow(
      /becomes Item.Published, but from .*"status":"draft".* it leaves .*"status":"draft"/,
    )
  })

  it('is judged over the row after, not the row before', () => {
    // Every row this starts from is a draft, none it leaves is.
    expect(() =>
      Write.update(StatusInput('archived'), { id: 'id', from: Draft, becomes: Draft }),
    ).toThrow(/it leaves/)
  })

  it('reads the from: without it a draft would be featured too', () => {
    const Feature = Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, featured: Schema.Literal(true) }),
    )
    expect(Write.update(Feature, { id: 'id', from: Published, becomes: Featured }).becomes).toEqual(
      Option.some(Featured),
    )
    expect(() => Write.update(Feature, { id: 'id', becomes: Featured })).toThrow(/it leaves/)
  })

  it("is the write's postcondition where enumeration cannot decide", () => {
    const Restock = Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, quantity: Schema.Number }),
      { quantity: Entity.unmapped },
    )
    const Sell = Write.update(Restock, {
      id: 'id',
      increment: { stock: 'quantity' },
      becomes: InStock,
    })
    const ensured = Write.ensured(Sell)
    expect(Sell.ensures).toEqual(Option.some(ensured))
    expect(ensured).toMatchObject({
      id: 'becomes:InStock',
      entity: 'Item',
      predicate: InStock.after,
      path: ['stock'],
      before: [],
      after: ['stock'],
    })
    // Judged over the row the write leaves, as an invariant of that write alone.
    expect(Entity.judgeAgainst([ensured], { before: { stock: 5 }, after: { stock: 0 } })).toEqual({
      _tag: 'Invalid',
      failures: [ensured],
    })
    expect(Entity.judgeAgainst([ensured], { before: { stock: 0 }, after: { stock: 1 } })).toEqual({
      _tag: 'Valid',
    })
  })

  it('ensures nothing where it is proved, or not declared', () => {
    const Publish = Write.update(StatusInput('published'), { id: 'id', becomes: Published })
    expect(Publish.ensures).toEqual(Option.none())
    expect(() => Write.ensured(Publish)).toThrow(/ensures nothing/)
    expect(Write.update(StatusInput('draft'), { id: 'id' }).ensures).toEqual(Option.none())
  })

  it('on an insert, is proved over what the insert sets', () => {
    const Create = Entity.input(
      Item,
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        status: Schema.Literal('draft'),
        featured: Schema.Boolean,
        stock: Schema.Number,
      }),
    )
    expect(Write.insert(Create, { id: 'id', becomes: Draft }).becomes).toEqual(Option.some(Draft))
    expect(() => Write.insert(Create, { id: 'id', becomes: Published })).toThrow(/it leaves/)
  })
})
