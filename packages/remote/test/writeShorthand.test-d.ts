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
