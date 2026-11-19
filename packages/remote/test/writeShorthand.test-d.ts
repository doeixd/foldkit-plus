/**
 * `Mutation.update`, `insert` and `delete` type what the long form types: the
 * input, the refusals, and the write; and refuse at the argument a key that is
 * no field, the id, or a value its field does not store.
 */
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation, Refusal } from 'foldkit-remote'
import { expectTypeOf } from 'vitest'

const Product = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Int,
  }),
)
const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })

const Rename = Mutation.update('Rename', Product, { set: { name: Schema.String } })
const RenameLong = Mutation.write(
  'Rename',
  Write.update(Entity.input(Product, Schema.Struct({ id: Schema.String, name: Schema.String })), {
    id: 'id',
  }),
)
expectTypeOf(Rename.name).toEqualTypeOf<'Rename'>()
expectTypeOf(Rename.Input.Type).toEqualTypeOf<{ readonly id: string; readonly name: string }>()
expectTypeOf(Rename.Input.Type).toEqualTypeOf(RenameLong.Input.Type)
expectTypeOf(Rename.Refusal.Type).toEqualTypeOf(RenameLong.Refusal.Type)

// A `when` or a `from` makes it conditioned, so it may be refused as unmet.
const Restock = Mutation.update('Restock', Product, {
  set: { stock: Schema.Int },
  when: ({ input }) => Expr.lt(Product.fields.stock, input.stock),
})
const Publish = Mutation.update('Publish', Product, {
  set: { status: Schema.Literal('published') },
  from: Draft,
  becomes: Published,
})
type Conditioned =
  | typeof Refusal.conflict.Type
  | typeof Refusal.unmet.Type
  | typeof Refusal.invalid.Type
expectTypeOf(Restock.Refusal.Type).toEqualTypeOf<Conditioned>()
expectTypeOf(Publish.Refusal.Type).toEqualTypeOf<Conditioned>()
expectTypeOf(Publish.Input.Type).toEqualTypeOf<{
  readonly id: string
  readonly status: 'published'
}>()

const Add = Mutation.insert('Add', Product, { set: { name: Schema.String } })
expectTypeOf(Add.Refusal.Type).toEqualTypeOf<
  typeof Refusal.taken.Type | typeof Refusal.invalid.Type
>()
const Drop = Mutation.delete('Drop', Product)
expectTypeOf(Drop.Input.Type).toEqualTypeOf<{ readonly id: string }>()
expectTypeOf(Drop.Refusal.Type).toEqualTypeOf<
  typeof Refusal.conflict.Type | typeof Refusal.referenced.Type | typeof Refusal.invalid.Type
>()
const DropDraft = Mutation.delete('DropDraft', Product, { from: Draft })
expectTypeOf(DropDraft.Refusal.Type).toEqualTypeOf<
  | typeof Refusal.conflict.Type
  | typeof Refusal.unmet.Type
  | typeof Refusal.referenced.Type
  | typeof Refusal.invalid.Type
>()

// The field's own schema, spread in, sets it too.
const Retitle = Mutation.update('Retitle', Product, { set: Entity.fields(Product, 'name') })
expectTypeOf(Retitle.Input.Type).toEqualTypeOf<{ readonly id: string; readonly name: string }>()

// @ts-expect-error "nmae" is no field of Product
Mutation.update('Typo', Product, { set: { nmae: Schema.String } })

// @ts-expect-error stock stores a number, not text
Mutation.update('Wrong', Product, { set: { stock: Schema.String } })

// @ts-expect-error status stores 'draft' or 'published' alone
Mutation.insert('Archived', Product, { set: { status: Schema.Literal('archived') } })

// @ts-expect-error the id names the row; it is never set
Mutation.update('Reid', Product, { set: { id: Schema.String } })

Mutation.update('Odd', Product, {
  set: { stock: Schema.Int },
  // @ts-expect-error a `when` reads the input's keys alone, and name is not one
  when: ({ input }) => Expr.eq(input.name, 'x'),
})

// @ts-expect-error `expect` names a key of `set`
Mutation.update('Stale', Product, { set: { name: Schema.String }, expect: 'stock' })

// An input key about the operation alone: in the input type as the long form's is.
const Restock2 = Mutation.update('Restock2', Product, {
  input: { quantity: Schema.Int },
  increment: { stock: 'quantity' },
})
const Restock2Long = Mutation.write(
  'Restock2',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)
expectTypeOf(Restock2.Input.Type).toEqualTypeOf<{
  readonly id: string
  readonly quantity: number
}>()
expectTypeOf(Restock2.Input.Type).toEqualTypeOf(Restock2Long.Input.Type)
expectTypeOf(Restock2.Refusal.Type).toEqualTypeOf(Restock2Long.Refusal.Type)

// Beside `set`, read by `decrement`, `compute` and `when` with the row.
const Sell = Mutation.update('Sell', Product, {
  set: { name: Schema.String },
  input: { quantity: Schema.Int, note: Schema.String },
  decrement: { stock: 'quantity' },
  when: ({ row, input }) => Expr.lte(input.quantity, row.stock),
})
expectTypeOf(Sell.Input.Type).toEqualTypeOf<{
  readonly id: string
  readonly name: string
  readonly quantity: number
  readonly note: string
}>()
expectTypeOf(Sell.Refusal.Type).toEqualTypeOf<Conditioned>()

Mutation.update('Both', Product, {
  set: { stock: Schema.Int },
  // @ts-expect-error a key set writes is no key about the operation
  input: { stock: Schema.Int },
})

// @ts-expect-error the id names the row; it is in the input already
Mutation.update('Reid2', Product, { input: { id: Schema.String } })

Mutation.update('BySet', Product, {
  set: { name: Schema.String, stock: Schema.Int },
  // @ts-expect-error an increment reads a key of `input`, and stock is set
  increment: { stock: 'stock' },
})

Mutation.update('ByText', Product, {
  input: { note: Schema.String },
  // @ts-expect-error an amount is a number key of `input`
  decrement: { stock: 'note' },
})

Mutation.update('OfText', Product, {
  input: { quantity: Schema.Int },
  // @ts-expect-error a decrement moves a number field, and name is text
  decrement: { name: 'quantity' },
})
