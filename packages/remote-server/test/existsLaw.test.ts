/**
 * The law over a feed whose body counts other rows through an exists (#344):
 * Home, an account's own posts and those of everyone it follows, with a
 * follow and an unfollow run through the client and through a memory server.
 * A follow's Home is the server's while pending and once answered; an
 * unfollow's is left to the server, since the store may not hold every
 * follow that keeps a post in it.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Collation, Entity, Expr, Held, Judge, Order, Relation, Write } from 'foldkit-entity'
import { Mutation, Query, Remote } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  RemoteServer,
  type MemoryBackend,
  type MemoryServed,
  type QuerySource,
} from '../src/index.js'

const UserFields = Entity.define(
  'User',
  Schema.Struct({ id: Schema.String, handle: Schema.String }),
)
const PostFields = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, body: Schema.String, createdAt: Schema.Number }),
)
const FollowFields = Entity.define('Follow', Schema.Struct({ id: Schema.String }))
const Social = Entity.relate(
  { User: UserFields, Post: PostFields, Follow: FollowFields },
  {
    Post: { author: Relation.one(UserFields) },
    Follow: { follower: Relation.one(UserFields), followee: Relation.one(UserFields) },
  },
)
const { User, Post } = Social
const Follow = Social.Follow.pipe(
  Entity.sets({ follower: Expr.viewer(UserFields) }, { on: 'create' }),
)

const accountId = Expr.input('accountId', Schema.String)

/** An account's own posts and those of everyone it follows, the newest first. */
const homeBody = Query.from(Post).pipe(
  Query.where(
    Expr.or(
      Expr.eq(Post.relations.author, accountId),
      Expr.path(
        Post.relations.author,
        Expr.exists(Follow.relations.followee, Expr.eq(Follow.relations.follower, accountId)),
      ),
    ),
  ),
  Query.orderBy(
    Order.desc(Post.fields.createdAt),
    Order.asc(Post.fields.id, { collation: Collation.binary }),
  ),
)
const Home = Query.define('Home', { accountId: Schema.String }, () => homeBody)

const FollowAccount = Mutation.write(
  'FollowAccount',
  Write.insert(
    Entity.input(Follow, Schema.Struct({ id: Schema.String, followeeId: Schema.String }), {
      followeeId: 'followee',
    }),
    { id: 'id' },
  ),
)
const UnfollowAccount = Mutation.write(
  'UnfollowAccount',
  Write.delete(Entity.input(Follow, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Post, Follow],
  queries: [Home],
  mutations: [FollowAccount, UnfollowAccount],
  viewer: () => Option.some(Remote.ref(UserFields, 'me')),
})

/** A stored row with each link as the id it points at, as `Held.rows` takes it. */
const ids = (row: Readonly<Record<string, unknown>>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === 'string' && value.startsWith('User:') ? value.slice('User:'.length) : value,
    ]),
  )

/**
 * Home as a server holding every row lists it: the reference semantics
 * (`Judge`) over complete tables. The memory backend's own interpreter runs
 * no exists.
 */
const homeOf = (stored: () => MemoryServed<string>): QuerySource<string> => ({
  query: 'Home',
  entity: 'Post',
  Input: Home.Input,
  run: ({ input }) =>
    Effect.sync(() => {
      const given = Schema.decodeUnknownSync(Home.Input)(input)
      const rows = Held.rows(
        [User, Post, Follow].map(entity => ({
          entity,
          rows: stored().rows(entity.name).map(ids),
        })),
      )
      const listed = stored()
        .rows('Post')
        .filter(post =>
          Option.exists(rows.row(Post, post['id']), row =>
            Judge.match(Judge.query(homeBody, given, row, { rows }), {
              onKnown: truth => truth,
              onUnknown: () => false,
            }),
          ),
        )
        .map(post => ({ id: String(post['id']), at: Number(post['createdAt']) }))
        .sort((left, right) => right.at - left.at || (left.id < right.id ? -1 : 1))
      return {
        edges: listed.map(({ id }) => ({ entity: 'Post', id, key: `Post:${id}` })),
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      }
    }),
})

/** A fresh server: mine is p1, ada's p2, whom I follow, and bo's p3 and p4, whom I do not. */
const server = () => {
  const backend: MemoryBackend<string> = RemoteServer.memory({
    // Home is served by `homeOf`, so the domain the backend interprets lists no query.
    domain: Remote.define({
      entities: [User, Post, Follow],
      mutations: [FollowAccount, UnfollowAccount],
    }),
    rows: {
      User: ['me', 'ada', 'bo'].map(id => ({ id, handle: id })),
      Post: [
        { id: 'p1', body: 'mine', createdAt: 10, author: 'User:me' },
        { id: 'p2', body: 'ada', createdAt: 20, author: 'User:ada' },
        { id: 'p3', body: 'bo', createdAt: 30, author: 'User:bo' },
        { id: 'p4', body: 'bo again', createdAt: 5, author: 'User:bo' },
      ],
      Follow: [{ id: 'f1', follower: 'User:me', followee: 'User:ada' }],
    },
    principal: 'me',
    viewer: principal => Option.some({ entity: 'User', id: principal }),
    mutations: store => [
      RemoteServer.mutation(FollowAccount, ({ input }) => {
        const values = {
          id: input.id,
          follower: 'User:me',
          followee: `User:${input.followeeId}`,
        }
        store.write('Follow', input.id, values)
        return Effect.succeed({
          output: {},
          entities: [{ entity: 'Follow', id: input.id, values }],
        })
      }),
      RemoteServer.mutation(UnfollowAccount, ({ input }) => {
        store.remove('Follow', input.id)
        return Effect.succeed({ output: {}, deleted: [{ entity: 'Follow', id: input.id }] })
      }),
    ],
    queries: [homeOf(() => backend)],
  })
  return backend
}

const home = Home.ref({ accountId: 'me' })

const checked = (mutation: typeof FollowAccount | typeof UnfollowAccount, input: unknown) =>
  Effect.runPromise(
    Law.check(Data, {
      model: { remote: Remote.initial },
      holds: [
        { entity: User, ids: ['me', 'ada', 'bo'] },
        { entity: Post, ids: ['p1', 'p2', 'p3', 'p4'] },
        { entity: Follow, ids: ['f1'] },
      ],
      lists: [home],
      mutation,
      input,
      now: 1,
    }).pipe(Effect.provide(server().layer)),
  )

describe('the law over a feed counting follows', () => {
  it('agrees on Home while a follow is pending, its posts already in it', async () => {
    const report = await checked(FollowAccount, { id: 'f2', followeeId: 'bo' })
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(
      expect.arrayContaining(['Follow:f2.follower', 'Follow:f2.followee', home.identity]),
    )
  })

  it('leaves Home to the server while an unfollow is pending', async () => {
    const report = await checked(UnfollowAccount, { id: 'f1' })
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toContain('Follow:f1')
    expect(report.unknown).toContain(home.identity)
  })
})
