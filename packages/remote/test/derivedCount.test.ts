/**
 * A `Derived.count` predicted while a declared write that moves a counted
 * row is pending, and settled by the server's answer (#233).
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Remote } from '../src/index.js'

const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))
const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
const Social = Entity.relate(
  { Post: PostFields, Like: LikeFields },
  { Like: { post: Relation.one(PostFields) } },
)
const Post = Social.Post.pipe(
  Entity.derived({ likeCount: Derived.count(Social.Like.relations.post) }),
)
const Like = Social.Like

const LikePost = Mutation.write(
  'LikePost',
  Write.insert(
    Entity.input(Like, Schema.Struct({ id: Schema.String, postId: Schema.String }), {
      postId: 'post',
    }),
    { id: 'id' },
  ),
)
const MoveLike = Mutation.write(
  'MoveLike',
  Write.update(
    Entity.input(Like, Schema.Struct({ id: Schema.String, postId: Schema.String }), {
      postId: 'post',
    }),
    { id: 'id' },
  ),
)
const Unlike = Mutation.write(
  'Unlike',
  Write.delete(Entity.input(Like, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post, Like],
  mutations: [LikePost, MoveLike, Unlike],
})

/** p1 with two likes, p2 with none, p3 not held, the like l1 of p1, and l2 read without its post. */
const held: Model = Data.reduce(
  { remote: Remote.initial },
  {
    _tag: 'ReadReceived',
    requests: [
      { entity: 'Post', id: 'p1', fields: ['likeCount'] },
      { entity: 'Post', id: 'p2', fields: ['likeCount'] },
      { entity: 'Like', id: 'l1', fields: ['post'] },
      { entity: 'Like', id: 'l2', fields: ['id'] },
    ],
    result: {
      settled: [],
      entities: [
        { entity: 'Post', id: 'p1', values: { id: 'p1', likeCount: 2 } },
        { entity: 'Post', id: 'p2', values: { id: 'p2', likeCount: 0 } },
        { entity: 'Like', id: 'l1', values: { id: 'l1', post: 'Post:p1' } },
        { entity: 'Like', id: 'l2', values: { id: 'l2' } },
      ],
    },
    now: 0,
  },
)

const Count = Entity.select(Post, { likeCount: true })
const count = (model: Model, id: string) => {
  const read = Data.get(Count, id).read(model)
  return read._tag === 'Ready' ? read.value.likeCount : read._tag
}
const counts = (model: Model) => [count(model, 'p1'), count(model, 'p2')]

describe('a Derived.count while a write is pending', () => {
  it('adds one where an insert points', () => {
    const { model } = Data.mutate(held, LikePost, { id: 'l9', postId: 'p2' })
    expect(counts(model)).toEqual([2, 1])
  })

  it('takes one away where a deleted row it holds pointed', () => {
    const { model } = Data.mutate(held, Unlike, { id: 'l1' })
    expect(counts(model)).toEqual([1, 0])
  })

  it('moves one from where an update’s row pointed to where it points', () => {
    const { model } = Data.mutate(held, MoveLike, { id: 'l1', postId: 'p2' })
    expect(counts(model)).toEqual([1, 1])
  })

  it.each([
    ['a delete of a row it does not hold', Unlike, { id: 'l7' }],
    ['an update of a row it does not hold', MoveLike, { id: 'l7', postId: 'p2' }],
    ['an update of a row held without where it points', MoveLike, { id: 'l2', postId: 'p2' }],
  ] as const)('predicts nothing for %s', (_, mutation, input) => {
    const { model } = Data.mutate(held, mutation, input)
    expect(counts(model)).toEqual([2, 0])
  })

  it('invents no row it does not hold the count of', () => {
    const { model } = Data.mutate(held, LikePost, { id: 'l9', postId: 'p3' })
    expect(Data.storeOf(model)['Post:p3']).toBeUndefined()
  })

  it('adds to a count read while the write is pending', () => {
    const { model } = Data.mutate(held, LikePost, { id: 'l9', postId: 'p1' })
    const reread = Data.reduce(model, {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Post', id: 'p1', fields: ['likeCount'] }],
      result: { settled: [], entities: [{ entity: 'Post', id: 'p1', values: { likeCount: 5 } }] },
      now: 1,
    })
    expect(count(reread, 'p1')).toBe(6)
  })

  it('lets the server’s count replace the prediction when the answer lands', () => {
    const sent = Data.mutate(held, LikePost, { id: 'l9', postId: 'p1' })
    const settled = Data.reduce(sent.model, {
      _tag: 'MutationSucceeded',
      requestId: sent.requestId,
      entities: [{ entity: 'Like', id: 'l9', values: { id: 'l9', post: 'Post:p1' } }],
      connections: [],
      deleted: [],
      read: {
        requests: [{ entity: 'Post', id: 'p1', fields: ['likeCount'] }],
        result: { settled: [], entities: [{ entity: 'Post', id: 'p1', values: { likeCount: 3 } }] },
      },
      now: 1,
    })
    expect(count(settled, 'p1')).toBe(3)
  })

  it('drops the prediction when the write fails', () => {
    const sent = Data.mutate(held, LikePost, { id: 'l9', postId: 'p1' })
    const failed = Data.reduce(sent.model, {
      _tag: 'MutationFailed',
      requestId: sent.requestId,
      error: { _tag: 'Server', message: 'no' },
      operation: 'o1',
    })
    expect(count(failed, 'p1')).toBe(2)
  })

  it('predicts nothing beside an optimistic list the caller gives', () => {
    const { model } = Data.mutate(held, LikePost, { id: 'l9', postId: 'p1' }, { optimistic: [] })
    expect(count(model, 'p1')).toBe(2)
  })
})
