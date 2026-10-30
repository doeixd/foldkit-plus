/**
 * A declared write's refusals: taken only for an insert, conflict for an update
 * or a delete, unmet only for one with a `when`, invalid for every one.
 */
import { Schema } from 'effect'
import { Entity, Expr, Write, type AnyWrite } from 'foldkit-entity'
import { Mutation, Refusal, type RefusalOfWrite } from 'foldkit-remote'
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

const Create = Mutation.write(
  'Create',
  Write.insert(Entity.input(Post, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
// An insert expects no revision, so it is never a conflict; a taken id is its own refusal.
expectTypeOf(Create.Refusal.Type).toEqualTypeOf<
  typeof Refusal.taken.Type | typeof Refusal.invalid.Type
>()
expectTypeOf<typeof Refusal.taken.Type>().toEqualTypeOf<{
  readonly _tag: 'Taken'
  readonly entity: string
  readonly id: string
}>()
// A write whose kind its type leaves open may be refused as any kind is.
expectTypeOf<RefusalOfWrite<AnyWrite>>().toEqualTypeOf<
  typeof Refusal.taken.Type | typeof Refusal.conflict.Type | typeof Refusal.invalid.Type
>()
const createArms: Record<(typeof Create.Refusal.Type)['_tag'], true> = {
  Taken: true,
  Invalid: true,
}
const plainTaken: Record<(typeof Plain.Refusal.Type)['_tag'], true> = {
  Conflict: true,
  Invalid: true,
  // @ts-expect-error an update is never refused as taken
  Taken: true,
}
const createConflict: Record<(typeof Create.Refusal.Type)['_tag'], true> = {
  Taken: true,
  Invalid: true,
  // @ts-expect-error an insert is never refused as a conflict
  Conflict: true,
}
// @ts-expect-error an insert may be refused as taken
const createNoTaken: Record<(typeof Create.Refusal.Type)['_tag'], true> = { Invalid: true }
void createArms
void plainTaken
void createConflict
void createNoTaken
