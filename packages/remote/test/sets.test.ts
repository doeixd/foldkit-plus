/**
 * What the write's context sets (`Entity.sets`), predicted while the write is
 * pending: who asks, from `Remote.make`'s viewer, and when, from the time the
 * reader acted (`Data.mutate`'s `now`), which the request sends too. With a
 * new row's derived members, the row shows whole before the answer.
 * operations-phase3-DESIGN.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity, Expr, Order, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Query, Remote } from '../src/index.js'

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
const PostFields = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    body: Schema.String,
    authorId: Schema.String,
    createdAt: Schema.Number,
    editedAt: Schema.Number,
  }),
)
const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
const Social = Entity.relate(
  { User: UserFields, Post: PostFields, Like: LikeFields },
  { Like: { post: Relation.one(PostFields), user: Relation.one(UserFields) } },
)
// Who wrote a post and when, and whose a like is, are the server's to choose.
const Post = Social.Post.pipe(
  Entity.sets({ authorId: Expr.viewer(UserFields), createdAt: Expr.now }, { on: 'create' }),
  Entity.sets({ editedAt: Expr.now }, { on: 'write' }),
  Entity.derived({
    likeCount: Derived.count(Social.Like.relations.post),
    liked: Derived.exists(Social.Like.relations.post, { viewer: Social.Like.relations.user }),
  }),
)
const { User } = Social
const Like = Social.Like.pipe(Entity.sets({ user: Expr.viewer(UserFields) }, { on: 'create' }))

const PostChirp = Mutation.write(
  'PostChirp',
  Write.insert(Entity.input(Post, Schema.Struct({ id: Schema.String, body: Schema.String })), {
    id: 'id',
  }),
)
const EditPost = Mutation.write(
  'EditPost',
  Write.update(Entity.input(Post, Schema.Struct({ id: Schema.String, body: Schema.String })), {
    id: 'id',
  }),
)
const LikePost = Mutation.write(
  'LikePost',
  Write.insert(
    Entity.input(Like, Schema.Struct({ id: Schema.String, postId: Schema.String }), {
      postId: 'post',
    }),
    { id: 'id' },
  ),
)

const Model = Schema.Struct({ remote: Remote.Model, me: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
/** The newest posts first, and one person's. */
const Newest = Query.define('Newest', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.createdAt))),
)
const ByAuthor = Query.define('ByAuthor', { authorId: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.fields.authorId, input.authorId)),
    Query.orderBy(Order.desc(Post.fields.createdAt)),
  ),
)

const config = {
  model: App.model.remote,
  entities: [User, Post, Like],
  queries: [Newest, ByAuthor],
  mutations: [PostChirp, EditPost, LikePost],
}
const Data = Remote.make({ ...config, viewer: model => Option.some(Remote.ref(User, model.me)) })
const Unviewed = Remote.make(config)

/**
 * Ada's page, which read p1 at 4000 and p2 at 5000. She has liked neither.
 * She acts at 5500 (`acted`), a time the store holds nowhere.
 */
const heard = (data: typeof Data): Model =>
  [
    { id: 'p1', now: 4_000 },
    { id: 'p2', now: 5_000 },
  ].reduce(
    (model, { id, now }) =>
      data.reduce(model, {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Post', id, fields: ['liked', 'likeCount'] }],
        result: {
          settled: [],
          entities: [{ entity: 'Post', id, values: { id, liked: null, likeCount: 2 } }],
        },
        now,
      }),
    { remote: Remote.initial, me: 'ada' },
  )

const acted = 5_500

const Chirp = Entity.select(Post, {
  body: true,
  authorId: true,
  createdAt: true,
  editedAt: true,
  likeCount: true,
  liked: true,
})
const shown = (data: typeof Data, model: Model, id: string) => {
  const read = data.get(Chirp, id).read(model)
  return read._tag === 'Ready'
    ? { ...read.value, liked: Option.getOrNull(read.value.liked) }
    : read._tag
}

describe('what the context sets, while the write is pending', () => {
  it('shows a new row whole: who asked, when they acted, and nothing pointing at it', () => {
    const { model } = Data.mutate(heard(Data), PostChirp, { id: 'n1', body: 'Hi' }, { now: acted })
    expect(shown(Data, model, 'n1')).toEqual({
      body: 'Hi',
      authorId: 'ada',
      createdAt: acted,
      editedAt: acted,
      likeCount: 0,
      liked: null,
    })
  })

  it('leaves out who asked when the page names no viewer, and the answer brings it', () => {
    const { model } = Unviewed.mutate(
      heard(Unviewed),
      PostChirp,
      { id: 'n1', body: 'Hi' },
      { now: acted },
    )
    const When = Entity.select(Post, { createdAt: true })
    const Who = Entity.select(Post, { authorId: true })
    expect(Unviewed.get(When, 'n1').read(model)).toMatchObject({ value: { createdAt: acted } })
    expect(Unviewed.get(Who, 'n1').read(model)._tag).not.toBe('Ready')
  })

  it('leaves out the time when it is given none, though the page has heard from the server', () => {
    const { model } = Data.mutate(heard(Data), PostChirp, { id: 'n1', body: 'Hi' })
    const When = Entity.select(Post, { createdAt: true })
    const Who = Entity.select(Post, { authorId: true })
    expect(Data.get(Who, 'n1').read(model)).toMatchObject({ value: { authorId: 'ada' } })
    expect(Data.get(When, 'n1').read(model)._tag).not.toBe('Ready')
  })

  it("sets what is set on: 'write' on an update, at the time the reader acted", () => {
    const Edited = Entity.select(Post, { body: true, editedAt: true })
    const { model } = Data.mutate(
      heard(Data),
      EditPost,
      { id: 'p1', body: 'Again' },
      { now: acted },
    )
    expect(Data.get(Edited, 'p1').read(model)).toMatchObject({
      value: { body: 'Again', editedAt: acted },
    })
    // Given no time, it predicts none: the answer brings the server's.
    const unclocked = Data.mutate(heard(Data), EditPost, { id: 'p1', body: 'Again' }).model
    expect(Data.get(Edited, 'p1').read(unclocked)._tag).not.toBe('Ready')
  })

  it('points a link the context sets at the viewer, so what it finds and counts moves at once', () => {
    const Hearted = Entity.select(Post, { likeCount: true, liked: true })
    const { model } = Data.mutate(heard(Data), LikePost, { id: 'l9', postId: 'p1' })
    expect(Data.get(Hearted, 'p1').read(model)).toMatchObject({
      value: { likeCount: 3, liked: Option.some('l9') },
    })
  })

  it('counts a like of a post still pending over the 0 the post started at', () => {
    const posted = Data.mutate(
      heard(Data),
      PostChirp,
      { id: 'n1', body: 'Hi' },
      { now: acted },
    ).model
    const { model } = Data.mutate(posted, LikePost, { id: 'l9', postId: 'n1' })
    expect(shown(Data, model, 'n1')).toMatchObject({ likeCount: 1, liked: 'l9' })
  })

  it("joins each loaded list its body admits, where the list's order puts it", () => {
    const Line = Entity.select(Post, { body: true })
    const newest = Data.query(Newest, {}, { select: Line, first: 25 })
    const theirs = Data.query(ByAuthor, { authorId: 'bob' }, { select: Line, first: 25 })
    const listed = [newest, theirs].reduce(
      (model, list) =>
        Data.reduce(model, {
          _tag: 'ConnectionMerged',
          connection: list.ref.identity,
          page: {
            edges: ['p1', 'p2'].map(id => ({ key: `Post:${id}`, ref: { entity: 'Post', id } })),
            start: { _tag: 'Terminal' },
            end: { _tag: 'Terminal' },
          },
        }),
      heard(Data),
    )
    const written = Data.reduce(listed, {
      _tag: 'ReadReceived',
      requests: ['p1', 'p2'].map(id => ({
        entity: 'Post',
        id,
        fields: ['body', 'authorId', 'createdAt'],
      })),
      result: {
        settled: [],
        entities: [
          {
            entity: 'Post',
            id: 'p1',
            values: { body: 'Newer', authorId: 'bob', createdAt: 4_500 },
          },
          {
            entity: 'Post',
            id: 'p2',
            values: { body: 'Older', authorId: 'bob', createdAt: 3_000 },
          },
        ],
      },
      now: 5_000,
    })
    // Ada's clock is behind the server's: she acts at 4000, after p2 and before p1.
    const sent = Data.mutate(written, PostChirp, { id: 'n1', body: 'Hi' }, { now: 4_000 })
    const bodies = (model: Model, list: typeof newest | typeof theirs) => {
      const read = list.read(model)
      return read._tag === 'Ready' ? read.value.items.map(post => post.body) : read._tag
    }
    expect(bodies(sent.model, newest)).toEqual(['Newer', 'Hi', 'Older'])
    // Ada's chirp is not Bob's.
    expect(bodies(sent.model, theirs)).toEqual(['Newer', 'Older'])
    // The server took her time, so the answer keeps the row where it stood.
    const answered = Data.reduce(sent.model, {
      _tag: 'MutationSucceeded',
      requestId: sent.requestId,
      entities: [
        {
          entity: 'Post',
          id: 'n1',
          values: { id: 'n1', body: 'Hi', authorId: 'ada', createdAt: 4_000 },
        },
      ],
      connections: [],
      deleted: [],
      now: 6_000,
    })
    expect(bodies(answered, newest)).toEqual(['Newer', 'Hi', 'Older'])
    expect(bodies(answered, theirs)).toEqual(['Newer', 'Older'])
  })
})
