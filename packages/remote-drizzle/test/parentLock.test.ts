import { PGlite } from '@electric-sql/pglite'
import { eq, sql } from 'drizzle-orm'
import { integer as pgInt, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as sqliteInt, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer, checkAggregateRule } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, sortParentIds, withParentLock, writer } from '../src/index.js'
import { postgres } from '../src/pg.js'

postgres()

const Account = Entity.define(
  'Account',
  Schema.Struct({
    id: Schema.String,
    balance: Schema.Int,
  }),
)

const Entry = Entity.define(
  'Entry',
  Schema.Struct({
    id: Schema.String,
    accountId: Schema.String,
    delta: Schema.Int,
  }),
)

const pgAccounts = pgTable('accounts', {
  id: pgText('id').primaryKey(),
  balance: pgInt('balance').notNull(),
})

const pgEntries = pgTable('entries', {
  id: pgText('id').primaryKey(),
  accountId: pgText('account_id').notNull(),
  delta: pgInt('delta').notNull(),
})

const sqliteEntries = sqliteTable('sqlite_entries', {
  id: sqliteText('id').primaryKey(),
  accountId: sqliteText('account_id').notNull(),
  delta: sqliteInt('delta').notNull(),
})

const PgDb = bind(
  { Account, Entry },
  {
    Account: { table: pgAccounts },
    Entry: { table: pgEntries },
  },
)

const SqliteDb = bind(
  { Entry },
  {
    Entry: { table: sqliteEntries },
  },
)

const AddEntry = Mutation.insert('AddEntry', Entry, {
  set: { accountId: Schema.String, delta: Schema.Int },
})

describe('Postgres parent-row lock and server totals (Phase 4 Bout 4.17)', () => {
  let pglite: PGlite

  beforeAll(async () => {
    pglite = await PGlite.create()
    await pglite.exec(`
      create table accounts (id text primary key, balance integer not null);
      create table entries (id text primary key, account_id text not null, delta integer not null);
    `)
  })

  afterAll(() => pglite.close())

  const pgLayer = () => databaseLayer(drizzlePg({ client: pglite }))

  it('sorts and deduplicates parent ids in ascending order to prevent deadlocks', () => {
    expect(sortParentIds(['b', 'a', 'b', 'c', 'a'])).toEqual(['a', 'b', 'c'])
    expect(sortParentIds(['acc-2', 'acc-1'])).toEqual(['acc-1', 'acc-2'])
  })

  it('declares parentRowLock: true on Postgres when parentLock is given and passes aggregate rule check', () => {
    const pgWriter = writer(PgDb.Entry, {
      parentLock: {
        table: pgAccounts,
        id: pgAccounts.id,
        by: ['accountId'],
      },
    })
    expect(pgWriter.store.parentRowLock).toBe(true)
    expect(() =>
      checkAggregateRule(pgWriter.store, {
        name: 'neverOverdrawn',
        entity: 'Account',
        over: 'Entries',
      }),
    ).not.toThrow()
  })

  it('refuses parentLock on SQLite at definition time and refuses aggregate rules on D1/SQLite', () => {
    expect(() =>
      writer(SqliteDb.Entry, {
        parentLock: {
          table: pgAccounts,
          id: pgAccounts.id,
          by: ['accountId'],
        },
      }),
    ).toThrow(/parentLock.*Postgres only/i)

    const d1Store = {
      name: 'D1',
      isolation: 'serializable' as const,
      isolates: 'statement' as const,
      parentRowLock: false,
    }
    expect(() =>
      checkAggregateRule(d1Store, {
        name: 'neverOverdrawn',
        entity: 'Account',
        over: 'Entries',
      }),
    ).toThrow(
      '[foldkit-remote-server] the rule "neverOverdrawn" of Account sums its Entries and needs parent-serialized; D1 (serializable per statement) judges it from a read first. Judge it on Postgres with the parent lock, or as a guard in the statement.',
    )
  })

  it('updates stored parent totals inside the locked Postgres transaction on child insert', async () => {
    await pglite.exec(
      "delete from entries; delete from accounts; insert into accounts values ('a1', 100)",
    )
    const entryWriter = writer(PgDb.Entry, {
      parentLock: {
        table: pgAccounts,
        id: pgAccounts.id,
        by: ['accountId'],
        onWrite: async ({ parentIds, tx }) => {
          for (const accountId of parentIds) {
            await tx.execute(
              sql`update accounts set balance = coalesce((select sum(delta) from entries where account_id = ${accountId}), 0) + 100 where id = ${accountId}`,
            )
          }
        },
      },
    })
    const handlers = RemoteServer.handlers(
      RemoteServer.make({
        entities: [],
        mutations: [RemoteServer.write(AddEntry, entryWriter)],
      }),
      undefined,
    )
    const res = await Effect.runPromise(
      handlers
        .FoldkitRemoteMutate({
          requestId: 'r1',
          mutation: 'AddEntry',
          input: { id: 'e1', accountId: 'a1', delta: -40 },
        })
        .pipe(Effect.result, Effect.provide(pgLayer())),
    )
    expect(res._tag).toBe('Success')
    const rows = (
      await pglite.query<{ balance: number }>("select balance from accounts where id = 'a1'")
    ).rows
    expect(rows[0]?.balance).toBe(60)
  })

  it('serializes concurrent overdrawing transfers and runs opposite-direction transfers without deadlocking', async () => {
    await pglite.exec(
      "delete from entries; delete from accounts; insert into accounts values ('a', 100), ('b', 100)",
    )

    const transfer = (id: string, from: string, to: string, amount: number) =>
      withParentLock(pgAccounts, pgAccounts.id, [from, to], async (tx, lockedIds) => {
        // Verify locks were acquired in ascending id order regardless of transfer direction
        expect(lockedIds).toEqual(sortParentIds([from, to]))
        const rows = await tx
          .select({ id: pgAccounts.id, balance: pgAccounts.balance })
          .from(pgAccounts)
          .where(eq(pgAccounts.id, from))
        const source = rows[0]
        if (!source || Number(source.balance) < amount) {
          return { _tag: 'Refused' as const, reason: 'neverOverdrawn' }
        }
        await tx.insert(pgEntries).values({ id: `${id}-out`, accountId: from, delta: -amount })
        await tx.insert(pgEntries).values({ id: `${id}-in`, accountId: to, delta: amount })
        await tx.execute(sql`update accounts set balance = balance - ${amount} where id = ${from}`)
        await tx.execute(sql`update accounts set balance = balance + ${amount} where id = ${to}`)
        return { _tag: 'Committed' as const }
      })

    // Two concurrent overdrawing transfers of 80 from 'a' (balance 100): one commits, one is refused.
    const [t1, t2] = await Promise.all([
      Effect.runPromise(transfer('t1', 'a', 'b', 80).pipe(Effect.provide(pgLayer()))),
      Effect.runPromise(transfer('t2', 'a', 'b', 80).pipe(Effect.provide(pgLayer()))),
    ])
    const tags = [t1._tag, t2._tag].sort()
    expect(tags).toEqual(['Committed', 'Refused'])

    // Two concurrent opposite-direction transfers ('a' -> 'b' and 'b' -> 'a'): both commit, no deadlock.
    const [o1, o2] = await Promise.all([
      Effect.runPromise(transfer('o1', 'a', 'b', 10).pipe(Effect.provide(pgLayer()))),
      Effect.runPromise(transfer('o2', 'b', 'a', 30).pipe(Effect.provide(pgLayer()))),
    ])
    expect(o1._tag).toBe('Committed')
    expect(o2._tag).toBe('Committed')

    const balances = (
      await pglite.query<{ id: string; balance: number }>(
        'select id, balance from accounts order by id asc',
      )
    ).rows
    // Started (100, 100) -> one 80 transfer (20, 180) -> -10/+30 on a, +10/-30 on b -> (40, 160)
    expect(balances).toEqual([
      { id: 'a', balance: 40 },
      { id: 'b', balance: 160 },
    ])
  })
})
