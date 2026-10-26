/** A declared write's refusal codec: it decodes unmet only for a write with a `when`. */
import { Schema } from 'effect'
import { Entity, Expr, Operators, Write } from 'foldkit-entity'
import {
  Mutation,
  Refusal,
  beginOptimistic,
  emptyOptimistic,
  optimisticOfWrite,
  settleFailure,
  visibleStore,
  writeEntities,
  type EntityStore,
  type OptimisticState,
} from 'foldkit-remote'
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

it('predicts a sum over the value the store holds as it is read, and only over one it holds', () => {
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
  const restock = (requestId: string, by: number, optimistic = emptyOptimistic) =>
    beginOptimistic(
      optimistic,
      requestId,
      optimisticOfWrite(Restock, { id: 'i1', name: 'Bolt', revision: 1, by }, undefined),
    )
  const stock = (base: EntityStore, optimistic: OptimisticState) =>
    visibleStore(base, optimistic)['Item:i1']?.values['stock']
  const held = writeEntities({}, [{ key: 'Item:i1', values: { stock: 10 } }])
  const one = restock('r1', 5)
  expect(stock(held, one)).toBe(15)
  // Two pending: each adds to what the one before shows.
  const two = restock('r2', -3, one)
  expect(stock(held, two)).toBe(12)
  // A change that reaches the store meanwhile is added to, not hidden.
  expect(stock(writeEntities(held, [{ key: 'Item:i1', values: { stock: 20 } }]), two)).toBe(22)
  // The first refused: only the second's amount remains.
  expect(stock(held, settleFailure(two, 'r1'))).toBe(7)
  // A stock the client has not read is not guessed; the name it sets still shows.
  const unread = writeEntities({}, [{ key: 'Item:i1', values: { name: 'Old' } }])
  expect(visibleStore(unread, one)['Item:i1']?.values).toEqual({ name: 'Bolt' })
})

it('predicts a computed field over the row as it is read, by the client table, and none without it', () => {
  const Tag = Entity.define(
    'Tag',
    Schema.Struct({ id: Schema.String, name: Schema.String, label: Schema.String }),
  )
  const concat = Expr.operator('acme.concat', {
    input: [Schema.String, Schema.String],
    output: Schema.String,
  })
  const table = Operators.memory(Operators.implement(concat, (left, right) => `${left}${right}`))
  const Relabel = Write.update(
    Entity.input(Tag, Schema.Struct({ id: Schema.String, prefix: Schema.String }), {
      prefix: Entity.unmapped,
    }),
    { id: 'id', compute: { label: ({ row, input }) => concat(input.prefix, row.name) } },
  )
  const pending = beginOptimistic(
    emptyOptimistic,
    'r1',
    optimisticOfWrite(Relabel, { id: 't1', prefix: 'o' }, undefined),
  )
  const label = (base: EntityStore, operators = table) =>
    visibleStore(base, pending, operators)['Tag:t1']?.values['label']
  const held = writeEntities({}, [{ key: 'Tag:t1', values: { name: 'ned', label: 'plain' } }])
  expect(label(held)).toBe('oned')
  // A change to what it reads reaches the store meanwhile: the prediction follows it.
  expect(label(writeEntities(held, [{ key: 'Tag:t1', values: { name: 'bo' } }]))).toBe('obo')
  // A client without the operator shows what the store holds until the server answers.
  expect(label(held, Operators.kernel)).toBe('plain')
  // And one that has not read what it computes from guesses nothing.
  expect(label(writeEntities({}, [{ key: 'Tag:t1', values: { label: 'plain' } }]))).toBe('plain')
})
