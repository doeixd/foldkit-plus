// @vitest-environment node
/**
 * A guarded delete of a row that takes others with it (#343, #348): the
 * guard judges the row named, and hands its writer each child's own Delete
 * rule, for the same person, which the writer judges over every row the
 * cascade takes, in the statement that deletes. One refused, and the whole
 * delete is `Forbidden`, and nothing goes. A relation declared
 * `authorizedBy: 'parent'` lets the post's owner take the likes under it.
 * On SQLite and Postgres; D1 is the writer's own test.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { Entity, Expr, Relation, Write, type AuthorizedBy } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Remote, RemoteClient } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String })
type User = typeof User.Type

const sqliteTables = {
  posts: sqliteTable('posts', { id: text('id').primaryKey(), ownerId: text('owner_id').notNull() }),
  likes: sqliteTable('likes', {
    id: text('id').primaryKey(),
    postId: text('post_id').notNull(),
    likerId: text('liker_id').notNull(),
  }),
}
const pgTables = {
  posts: pgTable('posts', { id: pgText('id').primaryKey(), ownerId: pgText('owner_id').notNull() }),
  likes: pgTable('likes', {
    id: pgText('id').primaryKey(),
    postId: pgText('post_id').notNull(),
    likerId: pgText('liker_id').notNull(),
  }),
}
type Tables = typeof sqliteTables | typeof pgTables

/** Posts and their likes, each its own Delete rule, the likes cascading as `likes` says. */
const domainOf = (likes: AuthorizedBy) => {
  const PostFields = Entity.define(
    'Post',
    Schema.Struct({ id: Schema.String, ownerId: Schema.String }),
  )
  const Related = Entity.relate(
    {
      Post: PostFields,
      Like: Entity.define('Like', Schema.Struct({ id: Schema.String, likerId: Schema.String })),
    },
    { Like: { post: Relation.one(PostFields, { onDelete: 'cascade', authorizedBy: likes }) } },
  )
  const G = Guards.declare(
    'Posts',
    User,
    guard => ({
      isOwner: guard.row(Related.Post, p => Expr.eq(Related.Post.fields.ownerId, p.id)),
      isLiker: guard.row(Related.Like, p => Expr.eq(Related.Like.fields.likerId, p.id)),
    }),
    { key: user => user.id, unguarded: 'allow' },
  )
  // `may` tells the page what each row's rules allow, so it can refuse a delete where it is made.
  const Post = Related.Post.pipe(Guards.attach(G, { row: { Delete: [G.isOwner] } }), Guards.may)
  const Like = Related.Like.pipe(
    Guards.attach(G, {
      row: { Delete: Guards.on([G.isLiker], Guards.explain('Only its liker may take it back.')) },
    }),
    Guards.may,
  )
  const Policy = G.implement({})
  const bindOn = ({ posts, likes: table }: Tables) =>
    bind(
      { Post, Like },
      {
        Post: {
          table: posts,
          visible: GuardDrizzle.visible(Policy, [Post]).Post,
          derived: { may: { supplied: true } },
        },
        Like: {
          table,
          relations: { post: { field: table.postId } },
          derived: { may: { supplied: true } },
        },
      },
    )
  return { Post, Like, Policy, bindOn }
}
const Judged = domainOf('child')
const Parented = domainOf('parent')

const DeletePost = (Post: typeof Judged.Post) =>
  Mutation.write(
    'DeletePost',
    Write.delete(Entity.input(Post, Schema.Struct({ id: Schema.String })), { id: 'id' }),
  )

// Ada's p1 has Bo's like; Ada's p2 only her own; Bo's p3 nothing.
const SCHEMA = [
  'create table posts (id text primary key, owner_id text not null)',
  'create table likes (id text primary key, post_id text not null, liker_id text not null)',
  "insert into posts values ('p1', 'ada'), ('p2', 'ada'), ('p3', 'bo')",
  "insert into likes values ('l1', 'p1', 'ada'), ('l2', 'p1', 'bo'), ('l3', 'p2', 'ada')",
]

interface Backend {
  readonly layer: Layer.Layer<DrizzleDatabase>
  readonly tables: Tables
  readonly ids: (table: 'posts' | 'likes') => Promise<ReadonlyArray<string>>
}

let pglite: PGlite
beforeAll(async () => {
  pglite = await PGlite.create()
})
afterAll(async () => {
  await pglite.close()
})

const backends: ReadonlyArray<readonly [string, () => Promise<Backend>]> = [
  [
    'SQLite',
    async () => {
      const sqlite = new DatabaseSync(':memory:')
      for (const statement of SCHEMA) sqlite.exec(statement)
      return {
        layer: databaseLayer(drizzle({ client: sqlite })),
        tables: sqliteTables,
        ids: async table =>
          sqlite
            .prepare(`select id from ${table} order by id`)
            .all()
            .map(row => String(row['id'])),
      }
    },
  ],
  [
    'Postgres',
    async () => {
      await pglite.exec('drop table if exists posts, likes')
      for (const statement of SCHEMA) await pglite.exec(statement)
      return {
        layer: databaseLayer(drizzlePg({ client: pglite })),
        tables: pgTables,
        ids: async table =>
          (await pglite.query<{ id: string }>(`select id from ${table} order by id`)).rows.map(
            row => row.id,
          ),
      }
    },
  ],
]

const sent = (
  backend: Backend,
  domain: typeof Judged,
  options: { readonly children?: ReadonlyArray<typeof Judged.Like> },
  id: string,
  as: Option.Option<User> = Option.some({ id: 'ada' }),
) => {
  const Db = domain.bindOn(backend.tables)
  const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [
      RemoteServer.write(
        DeletePost(domain.Post),
        GuardServer.writer(domain.Post, domain.Policy, writer(Db.Post), options),
      ),
    ],
  })
  return Effect.runPromise(
    RemoteServer.handlers(server, as)
      .FoldkitRemoteMutate({ requestId: `r-${id}`, mutation: 'DeletePost', input: { id } })
      .pipe(Effect.result, Effect.provide(backend.layer)),
  )
}

describe.each(backends)('A guarded delete that cascades, on %s', (_, open) => {
  it("is refused whole when it would take another's like, and removes nothing", async () => {
    const backend = await open()
    const answer = await sent(backend, Judged, { children: [Judged.Like] }, 'p1')
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(await backend.ids('posts')).toEqual(['p1', 'p2', 'p3'])
    expect(await backend.ids('likes')).toEqual(['l1', 'l2', 'l3'])
  })

  it("names the Entity and the like's own words, never whose like it is", async () => {
    const backend = await open()
    const answer = await sent(backend, Judged, { children: [Judged.Like] }, 'p1')
    const message = answer._tag === 'Failure' ? String(answer.failure.message) : ''
    expect(message).toBe(
      'It would delete a Like you may not delete: Only its liker may take it back.',
    )
    expect(message).not.toMatch(/l2|bo/)
  })

  it('takes the likes the person may take, with the post', async () => {
    const backend = await open()
    expect(await sent(backend, Judged, { children: [Judged.Like] }, 'p2')).toMatchObject({
      _tag: 'Success',
      success: {
        deleted: [
          { entity: 'Post', id: 'p2' },
          { entity: 'Like', id: 'l3' },
        ],
      },
    })
    expect(await backend.ids('likes')).toEqual(['l1', 'l2'])
  })

  it("judges the row named first: another's post is refused as before", async () => {
    const backend = await open()
    const answer = await sent(backend, Judged, { children: [Judged.Like] }, 'p3')
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(await backend.ids('posts')).toEqual(['p1', 'p2', 'p3'])
  })

  it("takes another's like under authorizedBy: 'parent'", async () => {
    const backend = await open()
    expect(await sent(backend, Parented, {}, 'p1')).toMatchObject({ _tag: 'Success' })
    expect(await backend.ids('posts')).toEqual(['p2', 'p3'])
    expect(await backend.ids('likes')).toEqual(['l3'])
  })
})

describe('A guarded writer for a delete that cascades', () => {
  const Db = Judged.bindOn(sqliteTables)

  it('is refused where it is made without the guarded Entity whose rules judge what it takes', () => {
    expect(() => GuardServer.writer(Judged.Post, Judged.Policy, writer(Db.Post))).toThrow(
      /takes Like rows under their own Delete rule \(Like\.post\); give Like's guarded Entity/,
    )
  })

  it('is refused given a child no cascade takes under its own rule', () => {
    const Opted = Parented.bindOn(sqliteTables)
    expect(() =>
      GuardServer.writer(Parented.Post, Parented.Policy, writer(Opted.Post), {
        children: [Parented.Like],
      }),
    ).toThrow(/takes no Like rows under their own Delete rule/)
  })

  it('is refused over a writer that cannot judge the rows it takes', () => {
    const { requires: _, ...unjudging } = writer(Db.Post)
    expect(() =>
      GuardServer.writer(Judged.Post, Judged.Policy, unjudging, { children: [Judged.Like] }),
    ).toThrow(/only a writer judging rules in its statement/)
  })
})

/**
 * The page's side (#348): a delete the page can see a taken row's `may`
 * refuse is refused where it is made, in the server's words; one whose rows
 * it holds without `may` is shown made, and the server's refusal brings
 * them back. `Law.check` holds both sides to the same answer.
 */
describe('A cascade judged by each row it takes, on the page', () => {
  const Model = Schema.Struct({ remote: Remote.Model })
  const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
  const Delete = DeletePost(Judged.Post)
  const Data = Remote.make({
    model: App.model.remote,
    entities: [Judged.Post, Judged.Like],
    mutations: [Delete],
  })
  const sqliteOf = () => {
    const sqlite = new DatabaseSync(':memory:')
    for (const statement of SCHEMA) sqlite.exec(statement)
    return sqlite
  }
  const clientOn = (sqlite: DatabaseSync) => {
    const Db = Judged.bindOn(sqliteTables)
    const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
      entities: [
        source(Db.Post, { filter: GuardServer.filter(Judged.Post, Judged.Policy) }),
        source(Db.Like, { filter: GuardServer.filter(Judged.Like, Judged.Policy) }),
      ],
      mutations: [
        RemoteServer.write(
          Delete,
          GuardServer.writer(Judged.Post, Judged.Policy, writer(Db.Post), {
            children: [Judged.Like],
          }),
        ),
      ],
    })
    return Remote.clientLayer(RemoteServer.handlers(server, Option.some<User>({ id: 'ada' }))).pipe(
      Layer.provide(databaseLayer(drizzle({ client: sqlite }))),
    )
  }
  /** What a read of Ada's post and Bo's like asked: a field it did not ask is not held. */
  const asked = (more: ReadonlyArray<string>) => [
    { entity: 'Post', id: 'p1', fields: ['id', 'ownerId'] },
    { entity: 'Like', id: 'l2', fields: ['id', 'likerId', 'post', ...more] },
  ]
  /** Bo's like, as the server answers its `may` to Ada. */
  const refusingDelete = {
    row: { Delete: false },
    reasons: { Delete: 'Only its liker may take it back.' },
    members: {},
    relations: {},
  }
  const lawOver = (id: string) =>
    Effect.runPromise(
      Law.check(Data, {
        model: { remote: Remote.initial },
        holds: [
          { entity: Judged.Post, ids: ['p1', 'p2', 'p3'] },
          { entity: Judged.Like, ids: ['l1', 'l2', 'l3'] },
        ],
        mutation: Delete,
        input: { id },
        now: 1,
      }).pipe(Effect.provide(clientOn(sqliteOf()))),
    )

  it("refuses, holding Bo's like and what it allows, as the server refuses it", async () => {
    const report = await lawOver('p1')
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(['DeletePost'])
  })

  it('takes a post with only likes Ada may take, and agrees on each', async () => {
    const report = await lawOver('p2')
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(expect.arrayContaining(['Post:p2', 'Like:l3']))
  })

  it("refuses where it is made, naming the like's Entity in the server's words", async () => {
    const held = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: asked(['may']),
        result: {
          settled: [],
          entities: [
            { entity: 'Post', id: 'p1', values: { id: 'p1', ownerId: 'ada' } },
            {
              entity: 'Like',
              id: 'l2',
              values: { id: 'l2', likerId: 'bo', post: 'Post:p1', may: refusingDelete },
            },
          ],
        },
        now: 1,
      },
    )
    const started = Data.mutate(held, Delete, { id: 'p1' })
    // Nothing is shown gone, and nothing is sent: the server is never asked.
    const like = Data.get(Entity.select(Judged.Like, { likerId: true }), 'l2')
    expect(like.read(started.model)).toMatchObject({ _tag: 'Ready' })
    const unsent: RemoteClient['Service'] = {
      read: () => Effect.die('unsent'),
      query: () => Effect.die('unsent'),
      mutate: () => Effect.die('unsent'),
      live: () => Stream.die('unsent'),
    }
    const refusal = await Effect.runPromise(
      started.command.effect.pipe(Effect.provideService(RemoteClient, unsent)),
    )
    expect(Data.failedWrites(Data.reduce(started.model, refusal))).toMatchObject([
      {
        error: {
          message: 'It would delete a Like you may not delete: Only its liker may take it back.',
        },
      },
    ])
  })

  it("shows a delete made where it holds no like's may, and brings the likes back when refused", async () => {
    const sqlite = sqliteOf()
    const held = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: asked([]),
        result: {
          settled: [],
          entities: [
            { entity: 'Post', id: 'p1', values: { id: 'p1', ownerId: 'ada' } },
            { entity: 'Like', id: 'l2', values: { id: 'l2', likerId: 'bo', post: 'Post:p1' } },
          ],
        },
        now: 1,
      },
    )
    const like = Data.get(Entity.select(Judged.Like, { likerId: true }), 'l2')
    const started = Data.mutate(held, Delete, { id: 'p1' })
    expect(like.read(started.model)).toMatchObject({ _tag: 'NotFound' })
    const answer = await Effect.runPromise(
      started.command.effect.pipe(Effect.provide(clientOn(sqlite))),
    )
    const settled = Data.reduce(started.model, answer)
    expect(like.read(settled)).toMatchObject({ _tag: 'Ready', value: { likerId: 'bo' } })
    expect(Data.failedWrites(settled)).toMatchObject([{ error: { _tag: 'Forbidden' } }])
    expect(
      sqlite
        .prepare('select id from likes order by id')
        .all()
        .map(row => row['id']),
    ).toEqual(['l1', 'l2', 'l3'])
  })

  it("shows the delete made under authorizedBy: 'parent', whatever the like's own may says", () => {
    const Opted = Remote.make({
      model: App.model.remote,
      entities: [Parented.Post, Parented.Like],
      mutations: [DeletePost(Parented.Post)],
    })
    const held = Opted.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: asked(['may']),
        result: {
          settled: [],
          entities: [
            { entity: 'Post', id: 'p1', values: { id: 'p1', ownerId: 'ada' } },
            {
              entity: 'Like',
              id: 'l2',
              values: { id: 'l2', likerId: 'bo', post: 'Post:p1', may: refusingDelete },
            },
          ],
        },
        now: 1,
      },
    )
    const started = Opted.mutate(held, DeletePost(Parented.Post), { id: 'p1' })
    expect(
      Opted.get(Entity.select(Parented.Like, { likerId: true }), 'l2').read(started.model),
    ).toMatchObject({ _tag: 'NotFound' })
  })
})
