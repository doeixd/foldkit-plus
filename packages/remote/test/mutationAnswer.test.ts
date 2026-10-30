/**
 * A mutation's answer carries what the client shows (#245): `Data.mutate`
 * says what its reads show of each entity, and the read the answer carries
 * back lands in the same reduction that releases the layer. A write also
 * asks for what its row foresees, which a page opened on the row while it is
 * pending reads (#370).
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity as DomainEntity, Expr, Order, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { shownOf } from '../src/shown.js'
import {
  Mutation,
  Query,
  Remote,
  RemoteClient,
  type MutationRequest,
  type RemoteMessage,
} from '../src/index.js'

const UserBase = DomainEntity.define(
  'User',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const PostBase = DomainEntity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    body: Schema.String,
    status: Schema.String,
    likes: Schema.Number,
  }),
)
const { User, Post } = DomainEntity.relate(
  { User: UserBase, Post: PostBase },
  { Post: { author: Relation.one(UserBase) } },
)

/** Active posts, the most liked first. */
const Feed = Query.define('Feed', {}, () =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.fields.status, 'active')),
    Query.orderBy(Order.desc(Post.fields.likes)),
  ),
)
const Touch = Mutation.make('Touch', { Input: { id: Schema.String }, Output: {} })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })

const PostRow = DomainEntity.select(Post, {
  title: true,
  likes: true,
  author: DomainEntity.select(User, { name: true }),
})

/** A domain whose active Surface lists the feed and shows one user's card. */
const make = (active: boolean) => {
  const Data = Remote.make({
    model: App.model.remote,
    entities: [User, Post],
    queries: [Feed],
    mutations: [Touch],
  })
  const feed = Data.query(Feed, {}, { select: PostRow, first: 25 })
  if (active)
    Data.subscriptions({
      home: App.surface('Home', {
        model: () => ({ feed, me: Data.get(DomainEntity.select(User, { id: true }), 'u1') }),
      }),
    })
  return { Data, feed }
}

/** Runs `Touch` through a client that records the request it was sent. */
const sent = async (active: boolean) => {
  const { Data } = make(active)
  const requests: Array<typeof MutationRequest.Type> = []
  const client = Layer.succeed(RemoteClient, {
    read: () => Effect.die('unused'),
    query: () => Effect.die('unused'),
    mutate: request => {
      requests.push(request)
      return Effect.succeed({ output: {}, entities: [] })
    },
    live: () => Stream.empty,
  })
  const { command } = Data.mutate({ remote: Remote.initial }, Touch, { id: 'p1' })
  await Effect.runPromise(command.effect.pipe(Effect.provide(client)))
  return requests[0]
}

describe('shownOf', () => {
  it('unions, per entity, what every read asks, relation targets included', () => {
    expect(
      shownOf(
        {
          requirements: [
            { entity: 'Post', id: 'p1', fields: ['title'], live: true },
            {
              entity: 'Post',
              id: 'p2',
              fields: ['body', 'author'],
              relations: { author: { entity: 'User', fields: ['name'] } },
            },
          ],
          connections: [
            {
              identity: 'Feed',
              window: { first: 25 },
              select: { entity: 'Post', fields: ['likes'], windows: { likes: { first: 3 } } },
            },
            {
              identity: 'Users',
              window: { first: 25 },
              select: { entity: 'User', fields: ['id'] },
            },
          ],
        },
        [],
        [],
      ),
    ).toEqual([
      {
        entity: 'Post',
        fields: ['title', 'body', 'author', 'likes'],
        windows: { likes: { first: 3 } },
        relations: { author: { entity: 'User', fields: ['name'] } },
      },
      { entity: 'User', fields: ['name', 'id'] },
    ])
  })

  it('adds every field the write’s own patches show and its row foresees, and nothing for a delete or a list change', () => {
    expect(
      shownOf(
        { requirements: [{ entity: 'Post', id: 'p1', fields: ['title'] }], connections: [] },
        [
          { entity: 'Post', id: 'p1', values: { body: 'b' } },
          { entity: 'User', id: 'u1', values: {}, adds: { postCount: -1 }, computes: {} },
          {
            entity: 'Tag',
            id: 't1',
            values: {},
            computes: { label: { _tag: 'Value', value: 'x' } },
          },
          { _tag: 'Delete', entity: 'Post', id: 'p2' },
          {
            _tag: 'Remove',
            connection: 'Feed',
            edge: { key: 'k', ref: { entity: 'Card', id: 'c1' } },
          },
        ],
        [{ entity: 'Post', fields: ['may'] }],
      ),
    ).toEqual([
      { entity: 'Post', fields: ['title', 'body', 'may'] },
      { entity: 'User', fields: ['postCount'] },
      { entity: 'Tag', fields: ['label'] },
    ])
  })
})

describe('Data.mutate', () => {
  it('sends what the active reads show of each entity', async () => {
    expect((await sent(true))?.shown).toEqual([
      {
        entity: 'User',
        fields: ['id', 'name'],
      },
      {
        entity: 'Post',
        // The feed's own body reads `status` to place a row, so it is shown too.
        fields: ['title', 'likes', 'author', 'status'],
        relations: { author: { entity: 'User', fields: ['name'] } },
      },
    ])
  })

  it('sends nothing to show when no read is active', async () => {
    expect(await sent(false)).not.toHaveProperty('shown')
  })
})

const loaded = (Data: ReturnType<typeof make>['Data'], feed: string): Model =>
  Data.reduce(
    Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: ['p1', 'p2'].map(id => ({
          entity: 'Post',
          id,
          fields: ['id', 'title', 'status', 'likes'],
        })),
        result: {
          settled: [],
          entities: [
            {
              entity: 'Post',
              id: 'p1',
              values: { id: 'p1', title: 'One', status: 'active', likes: 9 },
            },
            {
              entity: 'Post',
              id: 'p2',
              values: { id: 'p2', title: 'Two', status: 'active', likes: 3 },
            },
          ],
        },
        now: 0,
      },
    ),
    {
      _tag: 'ConnectionMerged',
      connection: feed,
      page: {
        edges: ['p1', 'p2'].map(id => ({ key: `Post:${id}`, ref: { entity: 'Post', id } })),
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    },
  )

/** p3 created: the answer carries what was stored; its read, how many like it and who wrote it. */
const answer = (likes: number): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId: 'r1',
  entities: [{ entity: 'Post', id: 'p3', values: { id: 'p3', title: 'Three', status: 'active' } }],
  read: {
    requests: [
      {
        entity: 'Post',
        id: 'p3',
        fields: ['likes', 'body', 'author'],
        relations: { author: { entity: 'User', fields: ['name'] } },
      },
    ],
    result: {
      entities: [
        { entity: 'Post', id: 'p3', values: { likes, author: 'User:u1' } },
        { entity: 'User', id: 'u1', values: { name: 'Ada' } },
      ],
      settled: [{ entity: 'Post', id: 'p3', fields: ['body'] }],
    },
  },
  now: 1,
})

describe('MutationSucceeded with a read', () => {
  const { Data, feed } = make(true)
  const identity = feed.ref.identity
  const started = Data.reduce(loaded(Data, identity), {
    _tag: 'MutationStarted',
    requestId: 'r1',
    optimistic: [
      Remote.patch(Post, 'p3', { id: 'p3', title: 'Three', status: 'active', likes: 0 }),
    ],
  })

  it('writes the read beside the answer, so the row reads Ready as the layer comes off', () => {
    const settled = Data.reduce(started, answer(5))
    expect(Data.get(PostRow, 'p3').read(settled)).toEqual({
      _tag: 'Ready',
      value: { title: 'Three', likes: 5, author: { name: 'Ada' } },
    })
    // A field the server settled without a value is not asked for again.
    expect(settled.remote.entities['Post:p3']?.unavailable).toEqual(new Set(['body']))
  })

  it('places the answered row in a list by a field only the read carries', () => {
    const settled = Data.reduce(started, answer(5))
    expect(settled.remote.connections[identity]?.stale).toBe(false)
    expect(Data.visibleItems(settled.remote, feed.ref).map(edge => edge.ref.id)).toEqual([
      'p1',
      'p3',
      'p2',
    ])
  })

  /** An answer naming `id` with `values`, whose read found `read` of it. */
  const touched = (
    id: string,
    values: Readonly<Record<string, unknown>>,
    read: Readonly<Record<string, unknown>>,
  ): RemoteMessage => ({
    _tag: 'MutationSucceeded',
    requestId: 'r2',
    entities: [{ entity: 'Post', id, values }],
    read: {
      requests: [{ entity: 'Post', id, fields: Object.keys(read) }],
      result: { entities: [{ entity: 'Post', id, values: read }], settled: [] },
    },
    now: 1,
  })
  const ids = (model: Model) => Data.visibleItems(model.remote, feed.ref).map(edge => edge.ref.id)

  it('moves a listed row by a field only the read changed', () => {
    // Liked: the answer names the post, and only its read says how many like it now.
    const liked = Data.reduce(loaded(Data, identity), touched('p2', {}, { likes: 10 }))
    expect(ids(liked)).toEqual(['p2', 'p1'])
  })

  it('judges a row by what its answer and its read changed together', () => {
    const held = Data.reduce(loaded(Data, identity), {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Post', id: 'p4', fields: ['id', 'title', 'status', 'likes'] }],
      result: {
        settled: [],
        entities: [
          {
            entity: 'Post',
            id: 'p4',
            values: { id: 'p4', title: 'Four', status: 'archived', likes: 1 },
          },
        ],
      },
      now: 0,
    })
    // Restored to the feed by its answer, and placed by the count its read carries.
    const restored = Data.reduce(held, touched('p4', { status: 'active' }, { likes: 5 }))
    expect(ids(restored)).toEqual(['p1', 'p4', 'p2'])
  })

  it('writes nothing on a repeated answer, its read included', () => {
    const once = Data.reduce(started, answer(5))
    const twice = Data.reduce(once, answer(7))
    expect(twice.remote.entities['Post:p3']?.values['likes']).toBe(5)
  })

  it('settles a failure the read answers', () => {
    const failed = Data.reduce(started, {
      _tag: 'ReadFailed',
      requests: [{ entity: 'Post', id: 'p3', fields: ['likes'] }],
      error: { _tag: 'RemoteReadError', message: 'offline' },
    })
    expect(Object.keys(failed.remote.failures.fields)).toEqual(['Post:p3\u0000likes'])
    expect(Data.reduce(failed, answer(5)).remote.failures.fields).toEqual({})
  })
})

describe('a write whose row foresees a member', () => {
  /** `pinned`: the server's to answer; the client foresees none of it, so the row waits. */
  const Card = DomainEntity.define(
    'Card',
    Schema.Struct({ id: Schema.String, title: Schema.String }),
  ).pipe(
    DomainEntity.derived({
      pinned: Derived.make(Schema.Boolean, { predict: () => Option.none() }),
    }),
  )
  const CardInput = DomainEntity.input(
    Card,
    Schema.Struct({ id: Schema.String, title: Schema.String }),
  )
  const CardId = DomainEntity.input(Card, Schema.Struct({ id: Schema.String }))
  const AddCard = Mutation.write('AddCard', Write.insert(CardInput, { id: 'id' }))
  const RenameCard = Mutation.write('RenameCard', Write.update(CardInput, { id: 'id' }))
  const DropCard = Mutation.write('DropCard', Write.delete(CardId, { id: 'id' }))
  const Data = Remote.make({
    model: App.model.remote,
    entities: [Card],
    mutations: [AddCard, RenameCard, DropCard],
  })
  const shownBy = async (
    started: ReturnType<typeof Data.mutate>,
  ): Promise<(typeof MutationRequest.Type)['shown']> => {
    const requests: Array<typeof MutationRequest.Type> = []
    const client = Layer.succeed(RemoteClient, {
      read: () => Effect.die('unused'),
      query: () => Effect.die('unused'),
      mutate: request => {
        requests.push(request)
        return Effect.succeed({ output: {}, entities: [] })
      },
      live: () => Stream.empty,
    })
    await Effect.runPromise(started.command.effect.pipe(Effect.provide(client)))
    return requests[0]?.shown
  }
  const card = { id: 'c1', title: 'Plan' }

  it.each([
    ['a create', Data.mutate({ remote: Remote.initial }, AddCard, card), ['id', 'title', 'pinned']],
    ['an edit', Data.mutate({ remote: Remote.initial }, RenameCard, card), ['title', 'pinned']],
  ])('asks, for %s, what its row foresees, though nothing reads it', async (_, started, fields) => {
    expect(await shownBy(started)).toEqual([{ entity: 'Card', fields }])
  })

  it('asks nothing of a row a delete leaves none of', async () => {
    expect(await shownBy(Data.mutate({ remote: Remote.initial }, DropCard, { id: 'c1' }))).toBe(
      undefined,
    )
  })
})
