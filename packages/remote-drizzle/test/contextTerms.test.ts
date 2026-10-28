/**
 * A query body over the write's context, compiled to SQL: `Expr.viewer` from
 * `RemoteServer.make`'s `viewer` of the principal, `Expr.now` from the
 * server's clock. The memory server reads the same, so the two agree.
 * ops-2-context-terms-DESIGN.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Clock, Effect, Option, Schema } from 'effect'
import { Entity, Expr, Order, Query as Body } from 'foldkit-entity'
import { Query, Remote } from 'foldkit-remote'
import { RemoteServer, type ServerDefinition } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, query, source, type DrizzleDatabase } from '../src/index.js'

const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  dueAt: integer('due_at').notNull(),
})

const User = Entity.define('User', Schema.Struct({ id: Schema.String }))
const Note = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, dueAt: Schema.Number }),
)
const Mine = Query.define('Mine', {}, () =>
  Body.from(Note).pipe(
    Body.where(Expr.eq(Note.fields.ownerId, Expr.viewer(User))),
    Body.orderBy(Order.asc(Note.fields.id)),
  ),
)
const Due = Query.define('Due', {}, () =>
  Body.from(Note).pipe(
    Body.where(Expr.lte(Note.fields.dueAt, Expr.now)),
    Body.orderBy(Order.asc(Note.fields.id)),
  ),
)
/** Whether the viewer is ada, decided before any row is: a predicate over the context alone. */
const AdaOnly = Query.define('AdaOnly', {}, () =>
  Body.from(Note).pipe(
    Body.where(Expr.eq(Expr.viewer(User), 'ada')),
    Body.orderBy(Order.asc(Note.fields.id)),
  ),
)

const Db = bind({ Note }, { Note: { table: notes } })
const viewer = (principal: string | null) =>
  Option.map(Option.fromNullishOr(principal), id => Remote.ref(User, id))

const drizzled = RemoteServer.make<string | null, DrizzleDatabase>({
  entities: [source(Db.Note)],
  queries: [Mine, Due, AdaOnly].map(each => query(each, { entity: Db.Note })),
  viewer,
})

const rows = [
  { id: 'n1', ownerId: 'ada', dueAt: 100 },
  { id: 'n2', ownerId: 'bo', dueAt: 300 },
  { id: 'n3', ownerId: 'ada', dueAt: 500 },
]
const memory = RemoteServer.memory({
  domain: Remote.define({ entities: [Note], queries: [Mine, Due, AdaOnly] }),
  rows: { Note: rows },
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

/** The ids `name` lists for `principal` at the server's time `at`, over SQLite. */
const listed = async (
  name: string,
  principal: string | null,
  at = 0,
): Promise<ReadonlyArray<string>> => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table notes (id text primary key, owner_id text not null, due_at integer not null);
    insert into notes values ('n1', 'ada', 100), ('n2', 'bo', 300), ('n3', 'ada', 500);
  `)
  try {
    const page = await Effect.runPromise(
      RemoteServer.handlers(drizzled, principal)
        .FoldkitRemoteQuery({ query: name, input: {}, window: {} })
        .pipe(
          Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
          Effect.provideService(Clock.Clock, clockAt(at)),
        ),
    )
    return page.edges.map(edge => edge.id)
  } finally {
    sqlite.close()
  }
}

/** The same, through the memory server. */
const remembered = async (
  name: string,
  principal: string | null,
  at = 0,
): Promise<ReadonlyArray<string>> => {
  const served: ServerDefinition<string | null> = memory.server
  const page = await Effect.runPromise(
    RemoteServer.handlers(served, principal)
      .FoldkitRemoteQuery({ query: name, input: {}, window: {} })
      .pipe(Effect.provideService(Clock.Clock, clockAt(at))),
  )
  return page.edges.map(edge => edge.id)
}

describe.each([
  ['SQL', listed],
  ['memory', remembered],
] as const)('a body over the context, through %s', (_, list) => {
  it("reads Expr.viewer as the server's viewer of the principal", async () => {
    expect(await list('Mine', 'ada')).toEqual(['n1', 'n3'])
    expect(await list('Mine', 'bo')).toEqual(['n2'])
  })

  it('lists nothing for a visitor', async () => {
    expect(await list('Mine', null)).toEqual([])
  })

  it("reads Expr.now as the server's clock", async () => {
    expect(await list('Due', null, 300)).toEqual(['n1', 'n2'])
    expect(await list('Due', null, 99)).toEqual([])
  })

  it('decides a predicate over the context alone with it', async () => {
    expect(await list('AdaOnly', 'ada')).toEqual(['n1', 'n2', 'n3'])
    expect(await list('AdaOnly', 'bo')).toEqual([])
  })
})

describe('a body over the viewer, run outside a server', () => {
  it('is refused, never read as a visitor', async () => {
    const run = query(Mine, { entity: Db.Note }).run({
      input: {},
      window: {},
      principal: 'ada',
    })
    await expect(
      Effect.runPromise(
        run.pipe(Effect.provide(databaseLayer(drizzle({ client: new DatabaseSync(':memory:') })))),
      ),
    ).rejects.toThrow('reads Expr.viewer, but was run outside a server')
  })
})
