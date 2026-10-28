/**
 * A retry racing its own original on a real Postgres, whose transactions run
 * at once under READ COMMITTED: PGlite runs one at a time, so it cannot show
 * the race. Runs when `FOLDKIT_LOCALE_PG` names a Postgres (see
 * `conformance.test.ts`); any locale will do.
 */
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import {
  bigint as pgBigint,
  integer as pgInteger,
  pgTable,
  primaryKey as pgPrimaryKey,
  text as pgText,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { Effect, Schema } from 'effect'
import { Entity, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, stock: Schema.Int, revision: Schema.Number }),
)
const items = pgTable('ledger_race_items', {
  id: pgText('id').primaryKey(),
  stock: pgInteger('stock').notNull(),
  revision: pgInteger('revision').notNull(),
})
const ledger = pgTable(
  'ledger_race_ledger',
  {
    scope: pgText('scope').notNull(),
    operation: pgText('operation').notNull(),
    target: pgText('target').notNull(),
    answer: pgText('answer').notNull(),
    at: pgBigint('at', { mode: 'number' }).notNull(),
    request: pgText('request'),
  },
  table => [pgPrimaryKey({ columns: [table.scope, table.operation, table.target] })],
)
// An increment that expects no revision: only the ledger keeps a retry from adding twice.
const Restock = Mutation.write(
  'Restock',
  Write.update(
    Entity.input(Item, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)

const pg = process.env.FOLDKIT_LOCALE_PG
// Skipped unless named; a pool connects only when first asked, so a skipped run opens none.
describe.skipIf(pg === undefined)(
  'A writer with a ledger, on a Postgres that runs transactions at once',
  () => {
    const db = drizzleNodePg(pg ?? 'postgres://unnamed')
    beforeAll(async () => {
      await db.execute(sql.raw('drop table if exists ledger_race_items, ledger_race_ledger'))
      await db.execute(
        sql.raw(`create table ledger_race_items (id text primary key, stock integer not null, revision integer not null);
          create table ledger_race_ledger (
            scope text not null, operation text not null, target text not null, answer text not null,
            at bigint not null, request text, primary key (scope, operation, target)
          );
          insert into ledger_race_items values ('i1', 0, 1);`),
      )
    }, 60_000)
    afterAll(async () => {
      await db.execute(sql.raw('drop table if exists ledger_race_items, ledger_race_ledger'))
      await db.$client.end()
    })

    it('answers each copy of one operation sent at once, and adds once', async () => {
      const server = RemoteServer.make<string, DrizzleDatabase>({
        entities: [],
        mutations: [
          RemoteServer.write(
            Restock,
            writer<string>(bind({ Item }, { Item: { table: items } }).Item, {
              ledger: { table: ledger, scope: principal => principal },
            }),
          ),
        ],
      })
      const send = (operation: string) =>
        Effect.runPromise(
          RemoteServer.handlers(server, 'ada')
            .FoldkitRemoteMutate({
              requestId: 'r',
              mutation: 'Restock',
              input: { id: 'i1', quantity: 1 },
              operation,
            })
            .pipe(Effect.result, Effect.provide(databaseLayer(db))),
        )
      const rounds = 40
      const outcomes: Record<string, number> = {}
      for (let round = 0; round < rounds; round++) {
        // The original and two retries of it, all in flight together.
        const answers = await Promise.all([1, 2, 3].map(() => send(`op-${round}`)))
        for (const answer of answers) {
          const key = answer._tag === 'Success' ? 'Success' : JSON.stringify(answer.failure)
          outcomes[key] = (outcomes[key] ?? 0) + 1
        }
      }
      expect(outcomes).toEqual({ Success: rounds * 3 })
      const [row] = await db.select({ stock: items.stock }).from(items)
      expect(row).toEqual({ stock: rounds })
    }, 120_000)
  },
)
