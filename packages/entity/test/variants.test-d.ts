/**
 * Variants of an Entity (#357), as the types see them: the stored fields, the
 * union, `Expr.is`'s narrowed fields, and what each refuses.
 */
import { Option, Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  Derived,
  Entity,
  Expr,
  Query,
  Relation,
  type PathExpr,
  type Predicate,
} from '../src/index.js'

const Price = Schema.Finite
const Note = Schema.OptionFromNullOr(Schema.String)
const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, name: Schema.String, price: Price, note: Note },
  Unconfirmed: { id: Schema.String, name: Schema.String },
})

// The stored row: shared as declared, a case field nullable unless it stores null already.
expectTypeOf(Domain.fields.name.schema).toEqualTypeOf<typeof Schema.String>()
expectTypeOf(Domain.fields.price.schema).toEqualTypeOf<Schema.NullOr<typeof Price>>()
expectTypeOf(Domain.fields.note.schema).toEqualTypeOf<typeof Note>()
expectTypeOf<Schema.Schema.Type<typeof Domain.fields._tag.schema>>().toEqualTypeOf<
  'Available' | 'Unconfirmed'
>()
expectTypeOf<typeof Domain.schema.Encoded>().toEqualTypeOf<{
  readonly _tag: 'Available' | 'Unconfirmed'
  readonly id: string
  readonly name: string
  readonly price: number | null
  readonly note: string | null
}>()

// The row: a union to match on.
type Row = typeof Domain.variants.Type
expectTypeOf<Row>().toEqualTypeOf<
  | {
      readonly _tag: 'Available'
      readonly id: string
      readonly name: string
      readonly price: number
      readonly note: Option.Option<string>
    }
  | { readonly _tag: 'Unconfirmed'; readonly id: string; readonly name: string }
>()
declare const row: Row
expectTypeOf(
  Domain.variants.match(row, { Available: ({ price }) => price, Unconfirmed: () => 0 }),
).toEqualTypeOf<number>()

// Expr.is hands out the case's fields, never null.
Expr.is(Domain, 'Available', fields => {
  expectTypeOf(fields.price.schema).toEqualTypeOf<typeof Price>()
  expectTypeOf<keyof typeof fields>().toEqualTypeOf<'id' | 'name' | 'price' | 'note'>()
  return Expr.lt(fields.price, 20)
})
Expr.is(Domain, 'Unconfirmed', fields => {
  // @ts-expect-error an Unconfirmed has no price
  void fields.price
  return Expr.eq(fields.name, 'x')
})
// @ts-expect-error Domain has no case Taken
Expr.is(Domain, 'Taken')

// Related and derived, it is still a variant Entity.
const Order = Entity.define('Order', Schema.Struct({ id: Schema.String }))
const Shop = Entity.relate(
  { Domain, Order },
  { Order: { domain: Relation.one(Domain), domains: Relation.many(Domain) } },
)
expectTypeOf(Shop.Domain.variants).toEqualTypeOf(Domain.variants)
const Counted = Shop.Domain.pipe(
  Entity.derived({ orders: Derived.count(Shop.Order.relations.domain) }),
)
expectTypeOf(Counted.variants).toEqualTypeOf(Domain.variants)
expectTypeOf(Shop.Order.relations.domain.target().variants).toEqualTypeOf(Domain.variants)

// Through a one relation: a path to each case field, read by the relation's owner.
const cheap = Expr.is(Shop.Order.relations.domain, 'Available', ({ price }) => {
  expectTypeOf(price).toExtend<PathExpr<number>>()
  return Expr.lt(price, 20)
})
Query.from(Shop.Order).pipe(Query.where(cheap))
// @ts-expect-error the test reads an Order, not a Domain
Query.from(Shop.Domain).pipe(Query.where(cheap))
// @ts-expect-error a many relation reaches no one row
Expr.is(Shop.Order.relations.domains, 'Available')

// An Entity of one shape has no variants.
// @ts-expect-error Order was declared with Entity.define
Expr.is(Order, 'Available')
// @ts-expect-error Order has no variants
void Order.variants

// Refused where declared.
// @ts-expect-error one shape is Entity.define
Entity.defineVariants('One', { Only: { id: Schema.String } })
// @ts-expect-error _tag is the case name
Entity.defineVariants('Tagged', { A: { _tag: Schema.String }, B: {} })
// @ts-expect-error price is a number in one case and text in the other
Entity.defineVariants('Clash', { A: { price: Schema.Finite }, B: { price: Schema.String } })

const asked: Predicate = Expr.is(Domain, 'Unconfirmed')
void asked
