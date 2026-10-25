/** A declared write's refusals: unmet only for one with a `when`, invalid for every one. */
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation, Refusal } from 'foldkit-remote'
import { expectTypeOf } from 'vitest'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, status: Schema.String, title: Schema.String }),
)
const Retitle = Entity.input(Post, Schema.Struct({ id: Schema.String, title: Schema.String }))

const Plain = Mutation.write('Plain', Write.update(Retitle, { id: 'id' }))
const Drafts = Mutation.write(
  'Drafts',
  Write.update(Retitle, { id: 'id', when: () => Expr.eq(Post.fields.status, 'draft') }),
)
const Removing = Mutation.write(
  'Removing',
  Write.delete(Entity.input(Post, Schema.Struct({ id: Schema.String })), {
    id: 'id',
    when: () => Expr.eq(Post.fields.status, 'draft'),
  }),
)

expectTypeOf(Plain.Refusal.Type).toEqualTypeOf<
  typeof Refusal.conflict.Type | typeof Refusal.invalid.Type
>()
expectTypeOf(Drafts.Refusal.Type).toEqualTypeOf<
  typeof Refusal.conflict.Type | typeof Refusal.unmet.Type | typeof Refusal.invalid.Type
>()
expectTypeOf(Removing.Refusal.Type).toEqualTypeOf<
  typeof Refusal.conflict.Type | typeof Refusal.unmet.Type | typeof Refusal.invalid.Type
>()
// The input type is the write's, conditioned or not.
expectTypeOf(Drafts.Input.Type).toEqualTypeOf<{ readonly id: string; readonly title: string }>()

// A match over a plain write's refusals needs no Unmet arm, and one over a conditioned write's does.
const plainArms: Record<(typeof Plain.Refusal.Type)['_tag'], true> = {
  Conflict: true,
  Invalid: true,
}
// @ts-expect-error a conditioned write may be refused as unmet
const draftArms: Record<(typeof Drafts.Refusal.Type)['_tag'], true> = {
  Conflict: true,
  Invalid: true,
}
// @ts-expect-error any declared write may be refused as invalid
const noInvalidArm: Record<(typeof Plain.Refusal.Type)['_tag'], true> = { Conflict: true }
void noInvalidArm
void plainArms
void draftArms
