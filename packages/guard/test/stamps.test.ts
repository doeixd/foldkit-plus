// @vitest-environment node
/**
 * Fields the server sets on a create, over real SQLite. A preset (the owner)
 * and a stamp (the time) count as set where an insert is registered (#202); a
 * retried insert keeps the stamp its first attempt wrote and is answered with
 * the row, while a preset that differs still makes it someone else's (#203).
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
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
// The invariants read the two fields the server sets, so an insert must count them as set.
const Like = LikeFields.pipe(
  Entity.invariant('noSelfLike', ({ after }) => Expr.not(Expr.eq(after.accountId, after.postId)), {
    message: 'You cannot like yourself',
  }),
  Entity.invariant('dated', ({ after }) => Expr.gte(after.createdAt, 0), {
    message: 'A like has a time',
  }),
  Guards.attach(G, { row: { Read: [G.isLiker], Create: [G.isLiker] } }),
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
const LikeAt = Mutation.write(
  'LikeAt',
  Write.insert(
    Entity.input(
      Like,
      Schema.Struct({ id: Schema.String, postId: Schema.String, createdAt: Schema.Number }),
    ),
    { id: 'id' },
  ),
)

let clock = 1000
const likeWriter = GuardServer.writer(Like, Policy, writer(Db.Like), {
  presets: { accountId: user => user.id },
  stamps: { createdAt: () => ++clock },
})
// Made per test, not where the file loads: registration is what the first test checks.
const serve = () =>
  RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [RemoteServer.write(LikePost, likeWriter), RemoteServer.write(LikeAt, likeWriter)],
  })

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    'create table likes (id text primary key, account_id text not null, post_id text not null, created_at integer not null)',
  )
  const layer = databaseLayer(drizzle({ client: sqlite }))
  const server = serve()
  const mutate = (who: string, requestId: string, mutation: string, input: unknown) =>
    Effect.runPromise(
      RemoteServer.handlers(server, Option.some({ id: who }))
        .FoldkitRemoteMutate({ requestId, mutation, input })
        .pipe(Effect.provide(layer), Effect.result),
    )
  const like = (who: string, requestId: string, input: unknown) =>
    mutate(who, requestId, 'LikePost', input)
  return { like, mutate, rows: () => sqlite.prepare('select * from likes').all() }
}

describe('fields the server sets on a create', () => {
  it('counts presets and stamps as set where an insert is registered', () => {
    // Without them the writer says nothing of the two fields the invariants read.
    expect(() =>
      RemoteServer.make({
        entities: [],
        mutations: [
          RemoteServer.write(LikePost, GuardServer.writer(Like, Policy, writer(Db.Like))),
        ],
      }),
    ).toThrow(
      'leaves unset a field an invariant reads (noSelfLike reads accountId; dated reads createdAt)',
    )
    expect(likeWriter.sets).toEqual(['accountId', 'createdAt'])
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

  it('refuses the same id from another account, whose preset owner differs', async () => {
    const { like, rows } = open()
    await like('ada', 'r1', { id: 'ada:p1', postId: 'p1' })
    expect(await like('bo', 'r2', { id: 'ada:p1', postId: 'p1' })).toMatchObject({
      _tag: 'Failure',
      failure: { message: 'Like ada:p1 could not be created' },
    })
    expect(rows()).toEqual([expect.objectContaining({ id: 'ada:p1', account_id: 'ada' })])
  })

  it('refuses an input that sets a stamp, and a field both preset and stamped', async () => {
    const { mutate, rows } = open()
    expect(
      await mutate('ada', 'r1', 'LikeAt', { id: 'ada:p2', postId: 'p2', createdAt: 1 }),
    ).toMatchObject({ _tag: 'Failure', failure: { message: /"createdAt" is set by the server/ } })
    expect(rows()).toEqual([])
    expect(() =>
      GuardServer.writer(Like, Policy, writer(Db.Like), {
        presets: { createdAt: () => 1 },
        stamps: { createdAt: () => 2 },
      }),
    ).toThrow(`Like's "createdAt" is both preset and stamped`)
  })
})
