/**
 * A `Derived.exists` predicted for the viewer while a declared write that
 * finds or loses it is pending, and the counts beside it (#233).
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Remote } from '../src/index.js'

const Id = Schema.String
const UserFields = Entity.define('User', Schema.Struct({ id: Id }))
const TeamFields = Entity.define('Team', Schema.Struct({ id: Id }))
const PostFields = Entity.define('Post', Schema.Struct({ id: Id }))
const LikeFields = Entity.define('Like', Schema.Struct({ id: Id }))
const Social = Entity.relate(
  { User: UserFields, Team: TeamFields, Post: PostFields, Like: LikeFields },
  { Like: { post: Relation.one(PostFields), user: Relation.one(UserFields) } },
)
const Post = Social.Post.pipe(
  Entity.derived({
    liked: Derived.exists(Social.Like.relations.post, { viewer: Social.Like.relations.user }),
    likeCount: Derived.count(Social.Like.relations.post),
  }),
)
const { User, Team, Like } = Social

const LikePost = Mutation.write(
  'LikePost',
  Write.insert(
    Entity.input(Like, Schema.Struct({ id: Id, postId: Id, userId: Id }), {
      postId: 'post',
      userId: 'user',
    }),
    { id: 'id' },
  ),
)
const MoveLike = Mutation.write(
  'MoveLike',
  Write.update(Entity.input(Like, Schema.Struct({ id: Id, postId: Id }), { postId: 'post' }), {
    id: 'id',
  }),
)
const GiveLike = Mutation.write(
  'GiveLike',
  Write.update(Entity.input(Like, Schema.Struct({ id: Id, userId: Id }), { userId: 'user' }), {
    id: 'id',
  }),
)
const Unlike = Mutation.write(
  'Unlike',
  Write.delete(Entity.input(Like, Schema.Struct({ id: Id })), { id: 'id' }),
)

const Model = Schema.Struct({ remote: Remote.Model, me: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const config = {
  model: App.model.remote,
  entities: [User, Team, Post, Like],
  mutations: [LikePost, MoveLike, GiveLike, Unlike],
}
const Data = Remote.make({ ...config, viewer: model => Option.some(Remote.ref(User, model.me)) })

/**
 * As ada reads them: p1 she liked with l1 (two likes), p2 nobody liked, p3
 * held without either member. No Like row is held: only `liked` names l1.
 */
const held: Model = Data.reduce(
  { remote: Remote.initial, me: 'ada' },
  {
    _tag: 'ReadReceived',
    requests: [
      { entity: 'Post', id: 'p1', fields: ['liked', 'likeCount'] },
      { entity: 'Post', id: 'p2', fields: ['liked', 'likeCount'] },
      { entity: 'Post', id: 'p3', fields: ['id'] },
    ],
    result: {
      settled: [],
      entities: [
        { entity: 'Post', id: 'p1', values: { id: 'p1', liked: 'l1', likeCount: 2 } },
        { entity: 'Post', id: 'p2', values: { id: 'p2', liked: null, likeCount: 0 } },
        { entity: 'Post', id: 'p3', values: { id: 'p3' } },
      ],
    },
    now: 0,
  },
)

const Shown = Entity.select(Post, { liked: true, likeCount: true })
const shown = (model: Model, id: string) => {
  const read = Data.get(Shown, id).read(model)
  return read._tag === 'Ready'
    ? [Option.getOrNull(read.value.liked), read.value.likeCount]
    : read._tag
}
const posts = (model: Model) => [shown(model, 'p1'), shown(model, 'p2')]

describe('a Derived.exists while a write is pending', () => {
  it('finds the like the viewer makes, beside the count', () => {
    const { model } = Data.mutate(held, LikePost, { id: 'l9', postId: 'p2', userId: 'ada' })
    expect(posts(model)).toEqual([
      ['l1', 2],
      ['l9', 1],
    ])
  })

  it('finds nothing for a like someone else makes', () => {
    const { model } = Data.mutate(held, LikePost, { id: 'l9', postId: 'p2', userId: 'bob' })
    expect(shown(model, 'p2')).toEqual([null, 1])
  })

  it('keeps the like a row was already found by', () => {
    const { model } = Data.mutate(held, LikePost, { id: 'l9', postId: 'p1', userId: 'ada' })
    expect(shown(model, 'p1')).toEqual(['l1', 3])
  })

  it('loses a like taken back, and counts it, with no Like row held', () => {
    const { model } = Data.mutate(held, Unlike, { id: 'l1' })
    expect(posts(model)).toEqual([
      [null, 1],
      [null, 0],
    ])
  })

  it('moves a like pointed at another row', () => {
    const { model } = Data.mutate(held, MoveLike, { id: 'l1', postId: 'p2' })
    expect(posts(model)).toEqual([
      [null, 1],
      ['l1', 1],
    ])
  })

  it('loses a like pointed at someone else', () => {
    const { model } = Data.mutate(held, GiveLike, { id: 'l1', userId: 'bob' })
    expect(posts(model)).toEqual([
      [null, 2],
      [null, 0],
    ])
  })

  it('invents no member on a row held without it', () => {
    const { model } = Data.mutate(held, LikePost, { id: 'l9', postId: 'p3', userId: 'ada' })
    expect(Data.storeOf(model)['Post:p3']?.present.has('liked')).toBe(false)
  })

  it('takes back a like made while it is pending', () => {
    const liked = Data.mutate(held, LikePost, { id: 'l9', postId: 'p2', userId: 'ada' })
    const { model } = Data.mutate(liked.model, Unlike, { id: 'l9' })
    expect(shown(model, 'p2')).toEqual([null, 0])
  })

  it('drops the prediction when the write fails', () => {
    const sent = Data.mutate(held, LikePost, { id: 'l9', postId: 'p2', userId: 'ada' })
    const failed = Data.reduce(sent.model, {
      _tag: 'MutationFailed',
      requestId: sent.requestId,
      error: { _tag: 'Server', message: 'no' },
      operation: 'o1',
    })
    expect(shown(failed, 'p2')).toEqual([null, 0])
  })

  it.each([
    ['no viewer', Remote.make(config)],
    [
      'a viewer of another Entity',
      Remote.make({ ...config, viewer: model => Option.some(Remote.ref(Team, model.me)) }),
    ],
  ])('finds nothing for a write with %s, and still counts it', (_, other) => {
    const { model } = other.mutate(held, LikePost, { id: 'l9', postId: 'p2', userId: 'ada' })
    expect(shown(model, 'p2')).toEqual([null, 1])
  })
})
