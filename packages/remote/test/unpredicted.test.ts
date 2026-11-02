/**
 * A list that selects what a declared insert cannot predict (#342): a row the
 * insert makes is not shown in it until the answer. Under `verifyPredictions`,
 * `Data.query` says so where the read is declared, naming the list, the
 * members and the insert.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity, Expr, Order, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Mutation, Query, Remote, RemoteData } from '../src/index.js'

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const PostFields = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    editedAt: Schema.NullOr(Schema.Number),
    createdAt: Schema.Number,
  }),
)
const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
const Social = Entity.relate(
  { User: UserFields, Post: PostFields, Like: LikeFields },
  {
    Post: {
      author: Relation.one(UserFields),
      editor: Relation.one(UserFields),
      likes: Relation.many(LikeFields),
    },
    Like: { post: Relation.one(PostFields) },
  },
)
const Post = Social.Post.pipe(
  Entity.sets({ author: Expr.viewer(UserFields), createdAt: Expr.now }, { on: 'create' }),
  Entity.derived({ likeCount: Derived.count(Social.Like.relations.post) }),
)

const Feed = Query.define('Feed', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.id))),
)
const CreatePost = Mutation.write(
  'CreatePost',
  Write.insert(Entity.input(Post, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
const EditPost = Mutation.write(
  'EditPost',
  Write.update(Entity.input(Post, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const domain = (verifyPredictions: boolean, mutations = [CreatePost, EditPost]) =>
  Remote.make({
    model: App.model.remote,
    entities: [Social.User, Post, Social.Like],
    queries: [Feed],
    mutations,
    viewer: () => Option.some(Remote.ref(UserFields, 'me')),
    verifyPredictions,
  })

const Edited = Entity.select(Post, { title: true, editedAt: true })

/** What the default reporter logged while `run` ran, by line. */
const logged = (run: () => void): ReadonlyArray<string> => {
  const lines: Array<string> = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...parts) => {
    lines.push(parts.map(String).join(' '))
  })
  try {
    run()
  } finally {
    spy.mockRestore()
  }
  return lines.filter(line => line.includes('[foldkit-remote]'))
}

afterEach(() => vi.restoreAllMocks())

describe('A list selecting what a declared insert cannot predict', () => {
  it('is reported where it is read, naming the list, the member and the insert', () => {
    const Data = domain(true)
    const lines = logged(() => Data.query(Feed, {}, { select: Edited, first: 25 }))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(
      "Feed selects Post.editedAt, which CreatePost cannot predict: a Post it makes is not shown in Feed until the server answers, and Feed reads Refreshing meanwhile. Map it in CreatePost's input, set it with Entity.sets, or select fewer.",
    )
  })

  it('is reported once, however often the list is read', () => {
    const Data = domain(true)
    const lines = logged(() => {
      Data.query(Feed, {}, { select: Edited, first: 25 })
      Data.query(Feed, {}, { select: Edited, first: 10 })
    })
    expect(lines).toHaveLength(1)
  })

  it('names every member the insert cannot predict', () => {
    const Data = domain(true)
    const select = Entity.select(Post, { title: true, editedAt: true, editor: true, likes: true })
    const lines = logged(() => Data.query(Feed, {}, { select, first: 25 }))
    expect(lines[0]).toContain(
      'Feed selects Post.editedAt, Post.editor, Post.likes, which CreatePost',
    )
  })

  it.each<[string, (Data: ReturnType<typeof domain>) => unknown]>([
    [
      'what its input maps',
      Data => Data.query(Feed, {}, { select: Entity.select(Post, { title: true }), first: 25 }),
    ],
    [
      'what its Entity sets on create',
      Data =>
        Data.query(
          Feed,
          {},
          {
            select: Entity.select(Post, { author: true, createdAt: true }),
            first: 25,
          },
        ),
    ],
    [
      'a count',
      Data => Data.query(Feed, {}, { select: Entity.select(Post, { likeCount: true }), first: 25 }),
    ],
  ])('is not reported for %s', (_, read) => {
    const Data = domain(true)
    expect(logged(() => read(Data))).toEqual([])
  })

  it('is not reported without verifyPredictions', () => {
    expect(logged(() => domain(false).query(Feed, {}, { select: Edited, first: 25 }))).toEqual([])
  })

  it('is not reported for an update, whose row the store holds', () => {
    const Data = domain(true, [EditPost])
    expect(logged(() => Data.query(Feed, {}, { select: Edited, first: 25 }))).toEqual([])
  })

  it('says what the list shows while the insert is pending', () => {
    const Data = domain(false)
    const feed = Data.query(Feed, {}, { select: Edited, first: 25 })
    const titles = Data.query(Feed, {}, { select: Entity.select(Post, { title: true }), first: 25 })
    const read = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Post', id: 'p0', fields: ['id', 'title', 'editedAt'] }],
        result: {
          settled: [],
          entities: [
            { entity: 'Post', id: 'p0', values: { id: 'p0', title: 'Zero', editedAt: null } },
          ],
        },
        now: 0,
      },
    )
    const loaded = Data.reduce(read, {
      _tag: 'ConnectionMerged',
      connection: Feed.ref({}).identity,
      page: {
        edges: [{ key: 'Post:p0', ref: { entity: 'Post', id: 'p0' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    })
    const pending = Data.mutate(loaded, CreatePost, { id: 'p1', title: 'One' }, { now: 1 }).model
    const shown = (read: typeof titles) =>
      RemoteData.match(read.read(pending), {
        Initial: () => 'Initial',
        Loading: () => 'Loading',
        Ready: page => `ready ${page.items.length}`,
        Refreshing: page => `refreshing ${page.items.length}`,
        Failed: () => 'Failed',
        NotFound: () => 'NotFound',
      })
    expect(shown(feed)).toBe('refreshing 1')
    expect(shown(titles)).toBe('ready 2')
  })
})
