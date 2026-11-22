// @vitest-environment node
/** `docs/entity.md`'s walk through one domain, run: what the guide says each reader answers. */
import { Optic, Schema } from 'effect'
import {
  Derived,
  Entity,
  Expr,
  Order,
  Query as Body,
  Relation,
  Write,
  evaluate,
} from 'foldkit-entity'
import { Laws } from 'foldkit-entity/laws'
import { Guards } from 'foldkit-guard'
import { Can, CanWire, Mutation, Query, Remote } from 'foldkit-remote'
import { ModelRef } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'

const User = Schema.Struct({ id: Schema.String })

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    name: Schema.String.check(Schema.isMinLength(1)),
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Number,
    reserved: Schema.Number,
    revision: Schema.Number,
  }),
)
const ReviewFields = Entity.define(
  'Review',
  Schema.Struct({ id: Schema.String, stars: Schema.Number }),
)
const Catalog = Entity.relate(
  { Product: ProductFields, Review: ReviewFields },
  { Review: { product: Relation.one(ProductFields) } },
)

const Shop = Guards.declare(
  'Shop',
  User,
  guard => ({
    isOwner: guard.row(ProductFields, user => Expr.eq(ProductFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)

const Product = Catalog.Product.pipe(
  Entity.derived({ reviewCount: Derived.count(Catalog.Review.relations.product) }),
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
  Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }),
)

const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })

const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, status: Schema.Literal('published') }),
    ),
    { id: 'id', from: Draft, becomes: Published },
  ),
)

const Reserve = Mutation.write(
  'Reserve',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, reserved: Schema.Number })),
    { id: 'id' },
  ),
)

const ForSale = Query.define('ForSale', { search: Schema.String }, ({ input }) =>
  Body.from(Published).pipe(
    Body.where(Expr.contains(Product.fields.name, input.search)),
    Body.orderBy(Order.desc(Product.fields.stock)),
  ),
)

const Card = Entity.select(Product, { name: true, stock: true, reviewCount: true })

const bolt = {
  id: 'p1',
  ownerId: 'ada',
  name: 'Bolt',
  status: 'draft',
  stock: 10,
  reserved: 2,
  revision: 1,
}
const rows = [
  bolt,
  {
    id: 'p2',
    ownerId: 'ada',
    name: 'Rivet',
    status: 'published',
    stock: 5,
    reserved: 0,
    revision: 1,
  },
  {
    id: 'p3',
    ownerId: 'bo',
    name: 'Bolt cutter',
    status: 'published',
    stock: 7,
    reserved: 7,
    revision: 1,
  },
]

describe('sixty seconds: one rule, three readers', () => {
  const Item = Entity.define(
    'Item',
    Schema.Struct({ id: Schema.String, stock: Schema.Number, reserved: Schema.Number }),
  ).pipe(
    Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
      message: 'Reserved stock cannot exceed the stock',
      path: ['reserved'],
    }),
  )
  const Hold = Mutation.write(
    'Hold',
    Write.update(
      Entity.input(Item, Schema.Struct({ id: Schema.String, reserved: Schema.Number })),
      { id: 'id' },
    ),
  )

  it('the judge refuses the row, and the check says the write can break the rule', () => {
    expect(Entity.judge(Item, { after: { id: 'i1', stock: 3, reserved: 5 } })._tag).toBe('Invalid')
    expect(Entity.judge(Item, { after: { id: 'i1', stock: 5, reserved: 5 } })._tag).toBe('Valid')
    expect(Laws.show(Laws.check({ writes: [Hold] }))).toBe(
      [
        'Hold   x reservedWithinStock   refused: Reserved stock cannot exceed the stock',
        '    before   reserved: 0, stock: 0',
        '    input    reserved: 1',
        '    after    reserved: 1, stock: 0',
        '',
        '1 entity, 0 states, 1 write, 1 rule: 1 pair, 0 kept, 1 refused, 0 undecided',
      ].join('\n'),
    )
  })
})

describe('one domain declaration, read by several readers', () => {
  it('the reference judge refuses a row that breaks the invariant, by its id and path', () => {
    const verdict = Entity.judge(Product, { after: { ...bolt, reserved: 11 } })
    expect(verdict._tag).toBe('Invalid')
    expect(Entity.judge(Product, { after: bolt })._tag).toBe('Valid')
  })

  it('the question is one body: shown, and answered over rows in memory', () => {
    const { body } = ForSale
    expect(Body.show(body)).toBe(
      [
        'FROM Product',
        'WHERE Product.Published',
        '  AND contains(Product.name, $search)',
        'ORDER BY Product.stock DESC',
      ].join('\n'),
    )
    expect(evaluate(body, { search: 'bolt' }, rows).map(row => row.id)).toEqual(['p3'])
    expect(evaluate(body, { search: '' }, rows).map(row => row.id)).toEqual(['p3', 'p2'])
  })

  it('the Selection carries a schema of what a card reads', () => {
    expect(Object.keys(Card.schema.fields)).toEqual(['name', 'stock', 'reviewCount'])
  })

  it('Laws.check reads the writes and the states, with no database', () => {
    expect(Laws.show(Laws.check({ writes: [Publish, Reserve] }))).toBe(
      [
        'Product',
        '  Draft -> Published   Publish   holds',
        '  Draft                          unreached',
        '  Published                      terminal',
        '',
        'Publish   x reservedWithinStock   kept: writes no member it reads',
        'Reserve   x reservedWithinStock   refused: Reserved stock cannot exceed the stock',
        '    before   reserved: 0, stock: 0',
        '    input    reserved: 1',
        '    after    reserved: 1, stock: 0',
        '',
        '1 entity, 2 states, 2 writes, 1 rule: 2 pairs, 1 kept, 1 refused, 0 undecided',
      ].join('\n'),
    )
  })

  it('a page asks before sending, from what it holds', () => {
    const Model = Schema.Struct({ remote: Remote.Model })
    const Data = Remote.make({
      model: ModelRef.fromOptic(Remote.Model, Optic.id<typeof Model.Type>().key('remote'), [
        'remote',
      ]),
      entities: [Product],
      queries: [ForSale],
      mutations: [Publish, Reserve],
    })
    const answer = Data.can({ remote: Remote.initial }, Publish, { id: 'p1', status: 'published' })
    expect(
      CanWire.match(Can.toWire(answer), {
        Yes: () => 'yes',
        No: () => 'no',
        Undecided: () => 'undecided',
      }),
    ).toBe('undecided')
  })
})
