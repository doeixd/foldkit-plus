/**
 * An insert's stamps, written by the server: who asks (`Stamp.viewer`), from
 * `RemoteServer.make`'s viewer, and when (`Stamp.clock`), from the Effect
 * clock. The input never sets either, and a retry keeps the row's own time.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Clock, Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation, Stamp, Write, type WriteStamps } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from '../src/index.js'

const users = sqliteTable('users', { id: text('id').primaryKey() })
const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  authorId: text('author_id').notNull(),
  createdAt: integer('created_at').notNull(),
})
const likes = sqliteTable('likes', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  userId: text('user_id').notNull(),
})

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
const PostFields = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    body: Schema.String,
    authorId: Schema.String,
    createdAt: Schema.Number,
  }),
)
const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
const Social = Entity.relate(
  { User: UserFields, Post: PostFields, Like: LikeFields },
  { Like: { post: Relation.one(PostFields), user: Relation.one(UserFields) } },
)

const Db = bind(
  { User: Social.User, Post: Social.Post, Like: Social.Like },
  {
    User: { table: users },
    Post: { table: posts },
    Like: {
      table: likes,
      relations: { post: { field: likes.postId }, user: { field: likes.userId } },
    },
  },
)

const PostChirp = Mutation.write(
  'PostChirp',
  Write.insert(
    Entity.input(Social.Post, Schema.Struct({ id: Schema.String, body: Schema.String })),
    { id: 'id', stamps: { authorId: Stamp.viewer, createdAt: Stamp.clock } },
  ),
)
const LikePost = Mutation.write(
  'LikePost',
  Write.insert(
    Entity.input(Social.Like, Schema.Struct({ id: Schema.String, postId: Schema.String }), {
      postId: 'post',
    }),
    { id: 'id', stamps: { user: Stamp.viewer } },
  ),
)

/** The asker is the User the principal names; none for a visitor. */
const viewer = (principal: string | null) =>
  Option.map(Option.fromNullishOr(principal), id => ({ entity: 'User', id }))

const server = RemoteServer.make<string | null, DrizzleDatabase>({
  entities: [source(Db.Post), source(Db.Like)],
  mutations: [
    RemoteServer.write(PostChirp, writer(Db.Post)),
    RemoteServer.write(LikePost, writer(Db.Like)),
  ],
  viewer,
})

/** A clock that reads `at`. */
const clockAt = (at: number): Clock.Clock => ({
  currentTimeMillisUnsafe: () => at,
  currentTimeMillis: Effect.succeed(at),
  currentTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  monotonicTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  sleep: () => Effect.void,
})

const sandbox = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table users (id text primary key);
    create table posts (
      id text primary key, body text not null, author_id text not null, created_at integer not null
    );
    create table likes (id text primary key, post_id text not null, user_id text not null);
    insert into users values ('ada'), ('bob');
    insert into posts values ('p1', 'Hello', 'ada', 1);
  `)
  const layer = databaseLayer(drizzle({ client: sqlite }))
  const mutate = (
    principal: string | null,
    mutation: string,
    input: object,
    at: number,
    requestId = 'r1',
  ) =>
    Effect.runPromise(
      RemoteServer.handlers(server, principal)
        .FoldkitRemoteMutate({ requestId, mutation, input })
        .pipe(
          Effect.result,
          Effect.provide(layer),
          Effect.provideService(Clock.Clock, clockAt(at)),
        ),
    )
  const row = (sql: string) => sqlite.prepare(sql).all()
  return { mutate, row, close: () => sqlite.close() }
}

describe("an insert's stamps, on the server", () => {
  it('writes who asked and when, and answers them', async () => {
    const { mutate, row, close } = sandbox()
    try {
      const answer = await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 5_000)
      expect(row("select author_id, created_at from posts where id = 'n1'")).toEqual([
        { author_id: 'bob', created_at: 5_000 },
      ])
      expect(answer).toMatchObject({
        success: {
          entities: [{ entity: 'Post', id: 'n1', values: { authorId: 'bob', createdAt: 5_000 } }],
        },
      })
    } finally {
      close()
    }
  })

  it('points a stamped relation at whoever asks', async () => {
    const { mutate, row, close } = sandbox()
    try {
      await mutate('ada', 'LikePost', { id: 'l1', postId: 'p1' }, 1)
      expect(row("select post_id, user_id from likes where id = 'l1'")).toEqual([
        { post_id: 'p1', user_id: 'ada' },
      ])
    } finally {
      close()
    }
  })

  it('never takes a stamped member from the input', async () => {
    const { mutate, row, close } = sandbox()
    try {
      await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi', authorId: 'ada', createdAt: 1 }, 7)
      expect(row("select author_id, created_at from posts where id = 'n1'")).toEqual([
        { author_id: 'bob', created_at: 7 },
      ])
    } finally {
      close()
    }
  })

  it("refuses a visitor's insert that stamps whoever asks, and writes nothing", async () => {
    const { mutate, row, close } = sandbox()
    try {
      const answer = await mutate(null, 'LikePost', { id: 'l1', postId: 'p1' }, 1)
      expect(answer).toMatchObject({ failure: { _tag: 'Forbidden' } })
      expect(row('select id from likes')).toEqual([])
    } finally {
      close()
    }
  })

  it('answers a retry later with the row it made, keeping its time', async () => {
    const { mutate, row, close } = sandbox()
    try {
      await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 5_000)
      const retried = await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 9_000)
      expect(retried).toMatchObject({
        success: { entities: [{ values: { authorId: 'bob', createdAt: 5_000 } }] },
      })
      expect(row("select created_at from posts where id = 'n1'")).toEqual([{ created_at: 5_000 }])
    } finally {
      close()
    }
  })

  it("refuses another asker's insert under an id already taken", async () => {
    const { mutate, close } = sandbox()
    try {
      await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 5_000)
      expect(await mutate('ada', 'PostChirp', { id: 'n1', body: 'Hi' }, 5_000)).toMatchObject({
        failure: { message: 'Post n1 could not be created' },
      })
    } finally {
      close()
    }
  })
})

describe("an insert's stamps, where the server is made", () => {
  it('refuses a server without a viewer for a write that stamps one', () => {
    expect(() =>
      RemoteServer.make<string, DrizzleDatabase>({
        entities: [source(Db.Like)],
        mutations: [RemoteServer.write(LikePost, writer(Db.Like))],
      }),
    ).toThrow('write "LikePost" stamps whoever asks (Stamp.viewer), but the server has no viewer')
  })

  it('counts a stamped field as set where an insert is registered', () => {
    const Dated = Social.Post.pipe(
      Entity.invariant('dated', ({ after }) => Expr.gte(after.createdAt, 0), {
        message: 'A post has a time',
      }),
    )
    const DatedDb = bind({ Post: Dated }, { Post: { table: posts } })
    const insert = (stamps: WriteStamps<typeof Dated>) =>
      Mutation.write(
        'PostChirp',
        Write.insert(
          Entity.input(
            Dated,
            Schema.Struct({ id: Schema.String, body: Schema.String, authorId: Schema.String }),
          ),
          { id: 'id', stamps },
        ),
      )
    expect(() => RemoteServer.write(insert({}), writer(DatedDb.Post))).toThrow(
      'leaves unset a field an invariant reads (dated reads createdAt)',
    )
    expect(() =>
      RemoteServer.write(insert({ createdAt: Stamp.clock }), writer(DatedDb.Post)),
    ).not.toThrow()
  })

  it('refuses a writer that sets a member the write stamps', () => {
    expect(() =>
      RemoteServer.write(PostChirp, { ...writer(Db.Post), sets: ['createdAt'] }),
    ).toThrow('write "PostChirp" stamps "createdAt", which its writer for Post also sets')
  })
})
