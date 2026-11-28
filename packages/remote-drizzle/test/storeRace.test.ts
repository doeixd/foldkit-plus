// @vitest-environment node
/**
 * What the writer says of its store is true of the real thing: writes to one
 * row sent at once, each from the revision it read, land one at a time.
 * Exactly one lands per round, so no withdrawal is lost, on in-process SQLite
 * and on D1 under miniflare (both declared `serializable`). Postgres is
 * declared `read-committed`, which still gives `row-atomic`: its test needs a
 * real server, which PGlite (one connection) cannot be, and runs when
 * `FOLDKIT_LOCALE_PG` names one, as CI does (see `ledgerRace.test.ts`).
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzleSqlite } from 'drizzle-orm/node-sqlite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

postgres()

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, stock: Schema.Int, revision: Schema.Number }),
)
// Takes one from the stock while some is left, from the revision the caller read.
const Take = Mutation.write(
  'Take',
  Write.update(
    Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      increment: { stock: 'quantity' },
      when: () => Expr.gte(Item.fields.stock, 1),
    },
  ),
)

const sqliteItems = sqliteTable('race_items', {
  id: text('id').primaryKey(),
  stock: integer('stock').notNull(),
  revision: integer('revision').notNull(),
})
const pgItems = pgTable('race_items', {
  id: pgText('id').primaryKey(),
  stock: pgInteger('stock').notNull(),
  revision: pgInteger('revision').notNull(),
})

const stored = Schema.decodeUnknownSync(
  Schema.Struct({ stock: Schema.Number, revision: Schema.Number }),
)

const STOCK = 6
const WRITERS = 8
const create =
  'create table race_items (id text primary key, stock integer not null, revision integer not null)'

/**
 * Rounds of `WRITERS` takes in flight together, each from the revision the last round left.
 * Returns how many landed each round and the row at the end.
 */
const race = async (
  table: Parameters<typeof bind>[1]['Item']['table'],
  layer: () => ReturnType<typeof databaseLayer>,
  read: () => Promise<{ readonly stock: number; readonly revision: number }>,
) => {
  const server = RemoteServer.make<string, DrizzleDatabase>({
    entities: [],
    mutations: [RemoteServer.write(Take, writer<string>(bind({ Item }, { Item: { table } }).Item))],
  })
  const handlers = RemoteServer.handlers(server, 'ada')
  let requests = 0
  const take = (revision: number) =>
    Effect.runPromise(
      handlers
        .FoldkitRemoteMutate({
          requestId: `r${++requests}`,
          mutation: 'Take',
          input: { id: 'i1', revision, quantity: -1 },
        })
        .pipe(Effect.result, Effect.provide(layer())),
    )
  const landed: Array<number> = []
  for (let round = 0; round < STOCK + 2; round++) {
    const { revision } = await read()
    const answers = await Promise.all(Array.from({ length: WRITERS }, () => take(revision)))
    landed.push(answers.filter(answer => answer._tag === 'Success').length)
    for (const answer of answers) {
      if (answer._tag === 'Success') continue
      // A copy that did not land was refused, never half-applied.
      expect(JSON.stringify(answer.failure)).toMatch(/"refusal":\{"_tag":"(Conflict|Unmet)"/)
    }
  }
  return { landed, row: await read() }
}

/** One lands per round while stock lasts, none after: no lost update, no oversell. */
const expected = {
  landed: [...Array.from({ length: STOCK }, () => 1), 0, 0],
  row: { stock: 0, revision: STOCK + 1 },
}

describe('a writer over SQLite, declared serializable', () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(create)
  sqlite.exec(`insert into race_items values ('i1', ${STOCK}, 1)`)
  afterAll(() => sqlite.close())

  it('lands one of the writes sent at once on a row, and loses none', async () => {
    const result = await race(
      sqliteItems,
      () => databaseLayer(drizzleSqlite({ client: sqlite })),
      async () => stored(sqlite.prepare('select stock, revision from race_items').get()),
    )
    expect(result).toEqual(expected)
  })
})

describe('a writer over D1, declared serializable', () => {
  let mf: Miniflare
  let db: Awaited<ReturnType<Miniflare['getD1Database']>>
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    })
    db = await mf.getD1Database('DB')
    await db.exec(create)
    await db.prepare(`insert into race_items values ('i1', ${STOCK}, 1)`).run()
  }, 60_000)
  afterAll(async () => {
    await mf.dispose()
  })

  it('lands one of the writes sent at once on a row, and loses none', async () => {
    const result = await race(
      sqliteItems,
      () => databaseLayer(drizzleD1(db)),
      async () => stored(await db.prepare('select stock, revision from race_items').first()),
    )
    expect(result).toEqual(expected)
  }, 120_000)
})

const pg = process.env.FOLDKIT_LOCALE_PG
// Skipped unless named; a pool connects only when first asked, so a skipped run opens none.
describe.skipIf(pg === undefined)(
  'a writer over Postgres, declared read-committed, on a server that runs transactions at once',
  () => {
    const database = drizzleNodePg(pg ?? 'postgres://unnamed')
    beforeAll(async () => {
      await database.execute(sql.raw('drop table if exists race_items'))
      await database.execute(sql.raw(create))
      await database.execute(sql.raw(`insert into race_items values ('i1', ${STOCK}, 1)`))
    }, 60_000)
    afterAll(async () => {
      await database.execute(sql.raw('drop table if exists race_items'))
      await database.$client.end()
    })

    it('still lands one of the writes sent at once on a row: the statement is row-atomic', async () => {
      const result = await race(
        pgItems,
        () => databaseLayer(database),
        async () => {
          const { rows } = await database.execute(sql`select stock, revision from race_items`)
          return stored(rows[0])
        },
      )
      expect(result).toEqual(expected)
    }, 120_000)
  },
)
