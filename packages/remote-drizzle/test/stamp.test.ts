/**
 * An insert's stamps, written by the server: who asks (`Stamp.viewer`), from
 * `RemoteServer.make`'s viewer, and when (`Stamp.clock`): the time the client
 * sent, within the server's `clockSkew` of the Effect clock, or that clock.
 * The input never sets either, and a retry, which the writer's ledger
 * recognises, keeps the row's own time.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Clock, Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation, Stamp, Write } from 'foldkit-entity'
import { Diagnostics, Mutation } from 'foldkit-remote'
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
const ledger = sqliteTable('write_ledger', {
  scope: text('scope').notNull(),
  operation: text('operation').notNull(),
  target: text('target').notNull(),
  answer: text('answer').notNull(),
  at: integer('at').notNull(),
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
// Who wrote a post and when, and whose a like is, are the server's to choose.
const Post = Social.Post.pipe(Entity.stamps({ authorId: Stamp.viewer, createdAt: Stamp.clock }))
const Like = Social.Like.pipe(Entity.stamps({ user: Stamp.viewer }))

const Db = bind(
  { User: Social.User, Post, Like },
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
  Write.insert(Entity.input(Post, Schema.Struct({ id: Schema.String, body: Schema.String })), {
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

/** The asker is the User the principal names; none for a visitor. */
const viewer = (principal: string | null) =>
  Option.map(Option.fromNullishOr(principal), id => ({ entity: 'User', id }))

/** The server, taking a client's time within `clockSkew` of its own (60 seconds by default). */
const serverWith = (clockSkew?: Parameters<typeof RemoteServer.make>[0]['clockSkew']) =>
  RemoteServer.make<string | null, DrizzleDatabase>({
    entities: [source(Db.Post), source(Db.Like)],
    mutations: [
      // Its ledger is what tells a retry of a post from another under its id.
      RemoteServer.write(
        PostChirp,
        writer<string | null>(Db.Post, {
          ledger: { table: ledger, scope: principal => principal ?? '' },
        }),
      ),
      RemoteServer.write(LikePost, writer(Db.Like)),
    ],
    viewer,
    clockSkew,
  })
const server = serverWith()

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

const sandbox = (made = server) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table users (id text primary key);
    create table posts (
      id text primary key, body text not null, author_id text not null, created_at integer not null
    );
    create table likes (id text primary key, post_id text not null, user_id text not null);
    create table write_ledger (
      scope text not null, operation text not null, target text not null, answer text not null,
      at integer not null, primary key (scope, operation, target)
    );
    insert into users values ('ada'), ('bob');
    insert into posts values ('p1', 'Hello', 'ada', 1);
  `)
  const layer = databaseLayer(drizzle({ client: sqlite }))
  const collected = Diagnostics.collect()
  /**
   * A write asked at the server's time `at`, sent with the client's `now` when
   * given. Every one goes as one operation, so the same write again is its retry.
   */
  const mutate = (
    principal: string | null,
    mutation: string,
    input: object,
    at: number,
    sent: { readonly now?: number } = {},
  ) =>
    Effect.runPromise(
      RemoteServer.handlers(made, principal)
        .FoldkitRemoteMutate({ requestId: 'r1', operation: 'o1', mutation, input, ...sent })
        .pipe(
          Effect.result,
          Effect.provide(layer),
          Effect.provideService(Clock.Clock, clockAt(at)),
          Effect.provideService(Diagnostics.Reporter, collected.report),
        ),
    )
  const row = (sql: string) => sqlite.prepare(sql).all()
  return { mutate, row, reported: collected.reported, close: () => sqlite.close() }
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

describe('the time the reader acted, as the client sends it', () => {
  const time = "select created_at from posts where id = 'n1'"

  it("is the time written, within the bound, before or after the server's", async () => {
    for (const now of [4_000, 66_000]) {
      const { mutate, row, reported, close } = sandbox()
      try {
        const answer = await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 6_000, { now })
        expect(row(time)).toEqual([{ created_at: now }])
        expect(answer).toMatchObject({ success: { entities: [{ values: { createdAt: now } }] } })
        expect(reported).toEqual([])
      } finally {
        close()
      }
    }
  })

  it("is replaced by the server's own past the bound, which it reports as ClockSkewed", async () => {
    for (const now of [999, 11_001]) {
      const { mutate, row, reported, close } = sandbox(serverWith('5 seconds'))
      try {
        await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 6_000, { now })
        expect(row(time)).toEqual([{ created_at: 6_000 }])
        expect(reported).toEqual([
          expect.objectContaining({
            _tag: 'ClockSkewed',
            source: 'foldkit-remote-server',
            level: 'warning',
            mutation: 'PostChirp',
            sent: now,
            own: 6_000,
            bound: 5_000,
          }),
        ])
      } finally {
        close()
      }
    }
  })

  it('is taken at the bound itself', async () => {
    const { mutate, row, close } = sandbox(serverWith('5 seconds'))
    try {
      await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 6_000, { now: 11_000 })
      expect(row(time)).toEqual([{ created_at: 11_000 }])
    } finally {
      close()
    }
  })

  it('is never taken by a server whose bound is 0, which reports nothing', async () => {
    const { mutate, row, reported, close } = sandbox(serverWith(0))
    try {
      await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 6_000, { now: 6_000 })
      expect(row(time)).toEqual([{ created_at: 6_000 }])
      await mutate('bob', 'PostChirp', { id: 'n2', body: 'Hi' }, 7_000, { now: 6_500 })
      expect(row("select created_at from posts where id = 'n2'")).toEqual([{ created_at: 7_000 }])
      expect(reported).toEqual([])
    } finally {
      close()
    }
  })

  it('is the same on a retry, which answers the row it made', async () => {
    const { mutate, row, close } = sandbox()
    try {
      await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 6_000, { now: 5_000 })
      const retried = await mutate('bob', 'PostChirp', { id: 'n1', body: 'Hi' }, 9_000, {
        now: 5_000,
      })
      expect(retried).toMatchObject({ success: { entities: [{ values: { createdAt: 5_000 } }] } })
      expect(row(time)).toEqual([{ created_at: 5_000 }])
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
    const dated = Entity.invariant<typeof Social.Post>(
      'dated',
      ({ after }) => Expr.gte(after.createdAt, 0),
      { message: 'A post has a time' },
    )
    const registered = (Dated: typeof Social.Post) =>
      RemoteServer.write(
        Mutation.write(
          'PostChirp',
          Write.insert(
            Entity.input(
              Dated,
              Schema.Struct({ id: Schema.String, body: Schema.String, authorId: Schema.String }),
            ),
            { id: 'id' },
          ),
        ),
        writer(bind({ Post: Dated }, { Post: { table: posts } }).Post),
      )
    expect(() => registered(Social.Post.pipe(dated))).toThrow(
      'leaves unset a field an invariant reads (dated reads createdAt)',
    )
    expect(() =>
      registered(Social.Post.pipe(dated, Entity.stamps({ createdAt: Stamp.clock }))),
    ).not.toThrow()
  })
})
