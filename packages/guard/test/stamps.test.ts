// @vitest-environment node
/**
 * Fields the server stamps on a create (`Entity.stamps`), under a guard, over
 * real SQLite. Who asks and when count as set where an insert is registered
 * (#202), a rule over who asks holds of the creator, and a retried insert
 * keeps the time its first attempt wrote and is answered with the row, while
 * another asker makes it someone else's (#203).
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Clock, Effect, Option, Schema } from 'effect'
import { Entity, Expr, Stamp, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { bind, databaseLayer, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String })
type User = typeof User.Type

const likes = sqliteTable('likes', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  postId: text('post_id').notNull(),
  createdAt: integer('created_at').notNull(),
})

const LikeFields = Entity.define(
  'Like',
  Schema.Struct({
    id: Schema.String,
    accountId: Schema.String,
    postId: Schema.String,
    createdAt: Schema.Number,
  }),
)
const G = Guards.declare(
  'Likes',
  User,
  guard => ({
    isLiker: guard.row(LikeFields, p => Expr.eq(LikeFields.fields.accountId, p.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
// The invariants read the two fields the server stamps, so an insert must count them as set.
const Ruled = LikeFields.pipe(
  Entity.invariant('noSelfLike', ({ after }) => Expr.not(Expr.eq(after.accountId, after.postId)), {
    message: 'You cannot like yourself',
  }),
  Entity.invariant('dated', ({ after }) => Expr.gte(after.createdAt, 0), {
    message: 'A like has a time',
  }),
)
const Like = Ruled.pipe(
  Guards.attach(G, { row: { Read: [G.isLiker], Create: [G.isLiker] } }),
  Entity.stamps({ accountId: Stamp.viewer, createdAt: Stamp.clock }),
)
const Policy = G.implement({})
const Db = bind(
  { Like },
  { Like: { table: likes, visible: GuardDrizzle.visible(Policy, [Like]).Like } },
)

const LikePost = Mutation.write(
  'LikePost',
  Write.insert(Entity.input(Like, Schema.Struct({ id: Schema.String, postId: Schema.String })), {
    id: 'id',
  }),
)
const likeWriter = GuardServer.writer(Like, Policy, writer(Db.Like))
// Made per test, not where the file loads: registration is what the first test checks.
const serve = () =>
  RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [RemoteServer.write(LikePost, likeWriter)],
    viewer: principal => Option.map(principal, user => ({ entity: 'User', id: user.id })),
  })

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    'create table likes (id text primary key, account_id text not null, post_id text not null, created_at integer not null)',
  )
  const layer = databaseLayer(drizzle({ client: sqlite }))
  const server = serve()
  let clock = 1000
  const like = (who: string, requestId: string, input: unknown) =>
    Effect.runPromise(
      RemoteServer.handlers(server, Option.some({ id: who }))
        .FoldkitRemoteMutate({ requestId, mutation: 'LikePost', input })
        .pipe(
          Effect.provide(layer),
          Effect.provideService(Clock.Clock, clockAt(++clock)),
          Effect.result,
        ),
    )
  return { like, rows: () => sqlite.prepare('select * from likes').all() }
}

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

describe('fields the server sets on a create', () => {
  it('counts the stamped fields as set where an insert is registered', () => {
    // Unstamped, nothing would set the two fields the invariants read.
    const Plain = bind({ Like: Ruled }, { Like: { table: likes } })
    expect(() =>
      RemoteServer.write(
        Mutation.write(
          'LikePost',
          Write.insert(
            Entity.input(Ruled, Schema.Struct({ id: Schema.String, postId: Schema.String })),
            { id: 'id' },
          ),
        ),
        writer(Plain.Like),
      ),
    ).toThrow(
      'leaves unset a field an invariant reads (noSelfLike reads accountId; dated reads createdAt)',
    )
    expect(serve).not.toThrow()
  })

  it('answers a retried insert with the row it made, keeping its first stamp', async () => {
    const { like, rows } = open()
    const first = await like('ada', 'r1', { id: 'ada:p1', postId: 'p1' })
    expect(first).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 'ada:p1', values: { accountId: 'ada' } }] },
    })
    // The clock has moved on; the retry is the same insert, by request or not.
    for (const requestId of ['r1', 'r2'])
      expect(await like('ada', requestId, { id: 'ada:p1', postId: 'p1' })).toEqual(first)
    expect(rows()).toHaveLength(1)
  })

  it('refuses the same id from another account, who asks is someone else', async () => {
    const { like, rows } = open()
    await like('ada', 'r1', { id: 'ada:p1', postId: 'p1' })
    expect(await like('bo', 'r2', { id: 'ada:p1', postId: 'p1' })).toMatchObject({
      _tag: 'Failure',
      failure: { message: 'Like ada:p1 could not be created' },
    })
    expect(rows()).toEqual([expect.objectContaining({ id: 'ada:p1', account_id: 'ada' })])
  })

  it('holds a rule over who asks of the creator', async () => {
    const { like, rows } = open()
    expect(await like('ada', 'r1', { id: 'ada:p1', postId: 'p1' })).toMatchObject({
      _tag: 'Success',
    })
    expect(rows()).toEqual([expect.objectContaining({ account_id: 'ada', created_at: 1001 })])
  })
})
