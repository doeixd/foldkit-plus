// @vitest-environment node
/**
 * Fields the write's context sets (`Entity.sets`), under a guard, over real
 * SQLite. Who asks and when count as set where an insert is registered (#202),
 * a rule over who asks holds of the creator, and a retried insert, which the
 * writer's ledger recognises, keeps the time its first attempt wrote and is
 * answered with the row, while another asker makes it someone else's (#203).
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Clock, Effect, Option, Schema } from 'effect'
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
const ledger = sqliteTable('write_ledger', {
  scope: text('scope').notNull(),
  operation: text('operation').notNull(),
  target: text('target').notNull(),
  answer: text('answer').notNull(),
  at: integer('at').notNull(),
  request: text('request'),
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
// The invariants read the two fields the context sets, so an insert must count them as set.
const UserRow = Entity.define('User', Schema.Struct({ id: Schema.String }))
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
  Entity.sets({ accountId: Expr.viewer(UserRow), createdAt: Expr.now }, { on: 'create' }),
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
const likeWriter = GuardServer.writer(
  Like,
  Policy,
  writer<Option.Option<User>>(Db.Like, {
    ledger: {
      table: ledger,
      scope: principal => Option.match(principal, { onNone: () => '', onSome: user => user.id }),
    },
  }),
)
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
    `create table likes (id text primary key, account_id text not null, post_id text not null, created_at integer not null);
    create table write_ledger (
      scope text not null, operation text not null, target text not null, answer text not null,
      at integer not null, request text, primary key (scope, operation, target)
    );`,
  )
  const layer = databaseLayer(drizzle({ client: sqlite }))
  const server = serve()
  let clock = 1000
  const like = (who: string, requestId: string, input: unknown) =>
    Effect.runPromise(
      RemoteServer.handlers(server, Option.some({ id: who }))
        // One operation: the same like again is its retry, by request or not.
        .FoldkitRemoteMutate({ requestId, operation: 'o1', mutation: 'LikePost', input })
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
  it('counts the fields the context sets as set where an insert is registered', () => {
    // Without the sets, nothing would set the two fields the invariants read.
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

  it('answers a retried insert with the row it made, keeping its first time', async () => {
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

describe('a field the context sets on an update, under a guard', () => {
  const notes = sqliteTable('notes', {
    id: text('id').primaryKey(),
    body: text('body').notNull(),
    editedAt: integer('edited_at').notNull(),
  })
  const NoteFields = Entity.define(
    'Note',
    Schema.Struct({ id: Schema.String, body: Schema.String, editedAt: Schema.Number }),
  )
  const N = Guards.declare(
    'Notes',
    User,
    // A note edited before the epoch would be a backdated one.
    guard => ({ dated: guard.row(NoteFields, () => Expr.gt(NoteFields.fields.editedAt, 0)) }),
    { key: user => user.id, unguarded: 'allow' },
  )
  const Note = NoteFields.pipe(
    Guards.attach(N, { row: { Update: [N.dated] } }),
    Entity.sets({ editedAt: Expr.now }, { on: 'write' }),
  )
  const NotesPolicy = N.implement({})
  const Notes = bind(
    { Note },
    { Note: { table: notes, visible: GuardDrizzle.visible(NotesPolicy, [Note]).Note } },
  )
  const EditNote = Mutation.write(
    'EditNote',
    Write.update(Entity.input(Note, Schema.Struct({ id: Schema.String, body: Schema.String })), {
      id: 'id',
    }),
  )
  const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [
      RemoteServer.write(EditNote, GuardServer.writer(Note, NotesPolicy, writer(Notes.Note))),
    ],
  })

  it('is judged by the rules as the row the update leaves holds it', async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`create table notes (id text primary key, body text not null, edited_at integer not null);
      insert into notes values ('n1', 'Hi', 5);`)
    const edit = (now: number) =>
      Effect.runPromise(
        RemoteServer.handlers(server, Option.some({ id: 'ada' }))
          .FoldkitRemoteMutate({
            requestId: `r${now}`,
            mutation: 'EditNote',
            input: { id: 'n1', body: 'Again' },
            now,
          })
          .pipe(
            Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
            Effect.provideService(Clock.Clock, clockAt(1_000)),
            Effect.result,
          ),
      )
    // Sent at 0, within the bound: the row it leaves breaks the rule.
    expect(await edit(0)).toMatchObject({ failure: { _tag: 'Forbidden' } })
    expect(await edit(900)).toMatchObject({ _tag: 'Success' })
    expect(sqlite.prepare('select body, edited_at from notes').all()).toEqual([
      { body: 'Again', edited_at: 900 },
    ])
  })
})
