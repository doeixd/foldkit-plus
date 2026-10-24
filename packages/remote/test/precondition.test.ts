/** A declared write's refusal codec: it decodes unmet only for a write with a `when`. */
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation, Refusal } from 'foldkit-remote'
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
