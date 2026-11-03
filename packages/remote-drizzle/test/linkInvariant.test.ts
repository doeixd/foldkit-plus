/**
 * An invariant over `one` relations (#345), "you cannot follow yourself":
 * judged over an insert's links, compiled into an update's statement with
 * the link it points as its new value, explained by the row after a miss,
 * and written as a CHECK over the columns the relations are stored on. On
 * SQLite and on Postgres.
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { getTableColumns } from 'drizzle-orm'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  bind,
  checkConstraints,
  databaseLayer,
  entityChecks,
  writer,
  type DrizzleDatabase,
} from '../src/index.js'

postgres()

const PersonFields = Entity.define('Person', Schema.Struct({ id: Schema.String }))
const FollowFields = Entity.define('Follow', Schema.Struct({ id: Schema.String }))
const Social = Entity.relate(
  { Person: PersonFields, Follow: FollowFields },
  { Follow: { follower: Relation.one(PersonFields), followee: Relation.one(PersonFields) } },
)
const notSelf = Entity.invariant<typeof Social.Follow>(
  'notSelf',
  ({ after }) => Expr.not(Expr.eq(after.follower, after.followee)),
  { message: 'You cannot follow yourself', path: ['followee'] },
)
const Follow = Social.Follow.pipe(notSelf)
const Person = Social.Person

const FollowInput = Schema.Struct({
  id: Schema.String,
  followerId: Schema.String,
  followeeId: Schema.String,
})
const FollowSomeone = Mutation.write(
  'FollowSomeone',
  Write.insert(
    Entity.input(Follow, FollowInput, { followerId: 'follower', followeeId: 'followee' }),
    { id: 'id' },
  ),
)
const Refollow = Mutation.write(
  'Refollow',
  Write.update(
    Entity.input(Follow, Schema.Struct({ id: Schema.String, followeeId: Schema.String }), {
      followeeId: 'followee',
    }),
    { id: 'id' },
  ),
)

const sqliteFollows = sqliteTable('follows', {
  id: text('id').primaryKey(),
  followerId: text('follower_id').notNull(),
  followeeId: text('followee_id').notNull(),
})
const pgFollows = pgTable('follows', {
  id: pgText('id').primaryKey(),
  followerId: pgText('follower_id').notNull(),
  followeeId: pgText('followee_id').notNull(),
})
const sqlitePeople = sqliteTable('people', { id: text('id').primaryKey() })
const pgPeople = pgTable('people', { id: pgText('id').primaryKey() })

const bindOn = (
  people: typeof sqlitePeople | typeof pgPeople,
  follows: typeof sqliteFollows | typeof pgFollows,
) =>
  bind(
    { Person, Follow },
    {
      Person: { table: people },
      Follow: {
        table: follows,
        relations: {
          follower: { field: follows.followerId },
          followee: { field: follows.followeeId },
        },
      },
    },
  )

const sqlite = new DatabaseSync(':memory:')
const pglite = new PGlite()
beforeAll(() => pglite.waitReady, 60_000)
afterAll(() => pglite.close())

interface Backend {
  readonly exec: (statement: string) => Promise<void>
  readonly rows: () => Promise<ReadonlyArray<unknown>>
  readonly layer: Layer.Layer<DrizzleDatabase>
  readonly Db: ReturnType<typeof bindOn>
}
const selectAll = 'select id, follower_id, followee_id from follows order by id'
const backends: ReadonlyArray<readonly [string, Backend]> = [
  [
    'SQLite',
    {
      exec: async statement => sqlite.exec(statement),
      rows: async () =>
        sqlite
          .prepare(selectAll)
          .all()
          .map(row => ({ ...row })),
      layer: databaseLayer(drizzle({ client: sqlite })),
      Db: bindOn(sqlitePeople, sqliteFollows),
    },
  ],
  [
    'Postgres',
    {
      exec: async statement => {
        await pglite.exec(statement)
      },
      rows: async () => (await pglite.query(selectAll)).rows,
      layer: databaseLayer(drizzlePg({ client: pglite })),
      Db: bindOn(pgPeople, pgFollows),
    },
  ],
]

const refusedAsSelf = {
  _tag: 'Failure',
  failure: { refusal: { _tag: 'Invalid', rule: 'notSelf', path: ['followee'] } },
}

describe.each(backends)('An invariant over one relations, on %s', (_, backend) => {
  const make = () =>
    RemoteServer.handlers(
      RemoteServer.make({
        entities: [],
        mutations: [
          RemoteServer.write(FollowSomeone, writer(backend.Db.Follow)),
          RemoteServer.write(Refollow, writer(backend.Db.Follow)),
        ],
      }),
      undefined,
    )
  // Made when first asked, so a writer refusing to be made fails a test, not the file.
  let made: ReturnType<typeof make> | undefined
  const handlers = () => (made ??= make())
  let requests = 0
  const send = (mutation: string, input: unknown) =>
    Effect.runPromise(
      handlers()
        .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input })
        .pipe(Effect.result, Effect.provide(backend.layer)),
    )
  const fresh = async (checked: boolean) => {
    const checks = checked
      ? checkConstraints(backend.Db.Follow)
          .constraints.map(({ constraint }) => `, ${constraint}`)
          .join('')
      : ''
    await backend.exec(
      `drop table if exists follows; create table follows (id text primary key, follower_id text not null, followee_id text not null${checks}); insert into follows values ('f1', 'ada', 'bo')`,
    )
  }

  it('refuses an insert pointing both relations at one row, and writes nothing', async () => {
    await fresh(false)
    expect(
      await send('FollowSomeone', { id: 'f2', followerId: 'ada', followeeId: 'ada' }),
    ).toMatchObject(refusedAsSelf)
    expect(
      await send('FollowSomeone', { id: 'f3', followerId: 'ada', followeeId: 'cy' }),
    ).toMatchObject({ _tag: 'Success' })
    expect((await backend.rows()).map(row => (row as { id: string }).id)).toEqual(['f1', 'f3'])
  })

  it('refuses an update pointing one relation where the other points, in its statement', async () => {
    await fresh(false)
    expect(await send('Refollow', { id: 'f1', followeeId: 'ada' })).toMatchObject(refusedAsSelf)
    expect(await backend.rows()).toEqual([{ id: 'f1', follower_id: 'ada', followee_id: 'bo' }])
    expect(await send('Refollow', { id: 'f1', followeeId: 'cy' })).toMatchObject({
      _tag: 'Success',
    })
  })

  it('compiles to a CHECK over the columns the relations are stored on', async () => {
    const [check] = checkConstraints(backend.Db.Follow).constraints
    expect(check?.name).toBe('follows_notSelf')
    expect(check?.constraint).toMatch(/follower_id.*followee_id/)
    await fresh(true)
    await expect(backend.exec("insert into follows values ('f9', 'cy', 'cy')")).rejects.toThrow()
  })
})

describe('entityChecks over one relations', () => {
  it('writes the CHECK over the columns given for the relations', () => {
    const checks = entityChecks(Follow, getTableColumns(sqliteFollows), {
      relations: { follower: sqliteFollows.followerId, followee: sqliteFollows.followeeId },
    })
    expect(checks.map(check => check.name)).toEqual(['follows_notSelf'])
  })

  it('writes a table bind reads back as agreeing with the Entity', () => {
    const checked = sqliteTable(
      'checked_follows',
      {
        id: text('id').primaryKey(),
        followerId: text('follower_id').notNull(),
        followeeId: text('followee_id').notNull(),
      },
      t =>
        entityChecks(Follow, t, { relations: { follower: t.followerId, followee: t.followeeId } }),
    )
    const Db = bind(
      { Person, Follow },
      {
        Person: { table: sqlitePeople },
        Follow: {
          table: checked,
          relations: {
            follower: { field: checked.followerId },
            followee: { field: checked.followeeId },
          },
        },
      },
    )
    expect(checkConstraints(Db.Follow).constraints.map(({ name }) => name)).toEqual([
      'checked_follows_notSelf',
    ])
  })

  it('refuses an invariant over a relation whose column it is not given', () => {
    expect(() => entityChecks(Follow, getTableColumns(sqliteFollows))).toThrow(/follower/)
  })
})
