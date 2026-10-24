/** A declared write's refusal codec: it decodes unmet only for a write with a `when`. */
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation, Refusal, optimisticOfWrite } from 'foldkit-remote'
import { expect, it } from 'vitest'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, status: Schema.String }))
const Retitle = Entity.input(Post, Schema.Struct({ id: Schema.String, status: Schema.String }))

it('decodes unmet for a write with a precondition, and refuses it for one without', () => {
  const drafts = Mutation.write(
    'Drafts',
    Write.update(Retitle, { id: 'id', when: () => Expr.eq(Post.fields.status, 'draft') }),
  )
  const plain = Mutation.write('Plain', Write.update(Retitle, { id: 'id' }))
  const decode = (codec: Schema.Codec<unknown, unknown>) => Schema.decodeUnknownResult(codec)
  expect(decode(drafts.Refusal)({ _tag: 'Unmet' })._tag).toBe('Success')
  expect(decode(drafts.Refusal)({ _tag: 'Conflict' })._tag).toBe('Success')
  expect(decode(plain.Refusal)({ _tag: 'Unmet' })._tag).toBe('Failure')
  expect(Refusal.isUnmet({ _tag: 'Unmet' })).toBe(true)
  expect(Refusal.isUnmet({ _tag: 'Conflict' })).toBe(false)
})

it('shows no sum in the optimistic patch, which only the server computes', () => {
  const Item = Entity.define(
    'Item',
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      stock: Schema.Number,
      revision: Schema.Number,
    }),
  )
  const Restock = Write.update(
    Entity.input(
      Item,
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        revision: Schema.Number,
        by: Schema.Number,
      }),
      { by: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { stock: 'by' } },
  )
  expect(
    optimisticOfWrite(Restock, { id: 'i1', name: 'Bolt', revision: 1, by: 5 }, undefined),
  ).toEqual([{ entity: 'Item', id: 'i1', values: { name: 'Bolt' } }])
})
