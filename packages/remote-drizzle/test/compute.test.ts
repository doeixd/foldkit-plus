/**
 * Computed assignments through the Drizzle writer: compiled into the
 * statement that writes, judged by the Entity's invariants in SQL and
 * explained in memory by the same row, never repeated by a retry, and landed
 * without a revision only by an operator shown to commute.
 * expr-operations-DESIGN §9.2, §9.3.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { SQLiteDialect, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Expr, Law, Operators, Write, isPredicate } from 'foldkit-entity'
import { Conformance } from 'foldkit-entity/conformance'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DrizzleOperators,
  bind,
  compileCall,
  databaseLayer,
  writer,
  type DrizzleDatabase,
} from '../src/index.js'

const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
})
/** Integer addition: commutes and associates, which evidence must show for each implementation. */
const add = Expr.operator('acme.add', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
  laws: [Law.commutative, Law.associative],
})
const memory = Operators.memory(
  Operators.implement(concat, (left, right) => `${left}${right}`),
  Operators.implement(add, (left, right) => left + right),
)
const sqlTable = DrizzleOperators.make(
  DrizzleOperators.implement(concat, ({ args: [left, right] }) => sql`(${left} || ${right})`),
  DrizzleOperators.implement(add, ({ args: [left, right] }) => sql`(${left} + ${right})`),
)

const Fields = Entity.define(
  'Part',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    label: Schema.String,
    score: Schema.Int,
    revision: Schema.Int,
  }),
)
const Part = Fields.pipe(
  Entity.invariant('notBanned', ({ after }) => Expr.not(Expr.eq(after.label, 'banned')), {
    message: 'That label is banned',
    path: ['label'],
  }),
)
const sqliteParts = sqliteTable('parts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  label: text('label').notNull(),
  score: integer('score').notNull(),
  revision: integer('revision').notNull(),
})
const pgParts = pgTable('parts', {
  id: pgText('id').primaryKey(),
  name: pgText('name').notNull(),
  label: pgText('label').notNull(),
  score: pgInteger('score').notNull(),
  revision: pgInteger('revision').notNull(),
})
const ledgerTable = sqliteTable(
  'write_ledger',
  {
    scope: text('scope').notNull(),
    operation: text('operation').notNull(),
    target: text('target').notNull(),
    answer: text('answer').notNull(),
    at: integer('at').notNull(),
  },
  table => [primaryKey({ columns: [table.scope, table.operation, table.target] })],
)

/** The label as a prefix before the name, at a revision. */
const Relabel = Mutation.write(
  'Relabel',
  Write.update(
    Entity.input(
      Part,
      Schema.Struct({ id: Schema.String, revision: Schema.Int, prefix: Schema.String }),
      { prefix: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      compute: { label: ({ row, input }) => concat(input.prefix, row.name) },
    },
  ),
)
/** The score moved by an amount through `add`, expecting no revision. */
const Score = Mutation.write(
  'Score',
  Write.update(
    Entity.input(Part, Schema.Struct({ id: Schema.String, by: Schema.Int }), {
      by: Entity.unmapped,
    }),
    { id: 'id', compute: { score: ({ row, input }) => add(row.score, input.by) } },
  ),
)

const create =
  'create table parts (id text primary key, name text not null, label text not null, score integer not null, revision integer not null)'
const seed = "insert into parts values ('p1', 'ned', 'plain', 10, 1)"

const sqlite = new DatabaseSync(':memory:')
const pglite = new PGlite()
beforeAll(() => pglite.waitReady, 60_000)
afterAll(async () => {
  sqlite.close()
  await pglite.close()
})

const backends = [
  [
    'SQLite',
    {
      fresh: async () => {
        sqlite.exec(`drop table if exists parts; ${create}; ${seed}`)
      },
      row: async () => sqlite.prepare('select label, score, revision from parts').get(),
      layer: () => databaseLayer(drizzle({ client: sqlite })),
      Db: () =>
        bind({ Part }, { Part: { table: sqliteParts } }, { operators: { memory, sql: sqlTable } }),
    },
  ],
  [
    'Postgres',
    {
      fresh: async () => {
        await pglite.exec(`drop table if exists parts; ${create}; ${seed}`)
      },
      row: async () => (await pglite.query('select label, score, revision from parts')).rows[0],
      layer: () => databaseLayer(drizzlePg({ client: pglite })),
      Db: () =>
        bind({ Part }, { Part: { table: pgParts } }, { operators: { memory, sql: sqlTable } }),
    },
  ],
] as const

describe.each(backends)('A computed assignment on %s', (_, backend) => {
  const send = async (input: unknown) => {
    const server = RemoteServer.make<null, DrizzleDatabase>({
      entities: [],
      mutations: [RemoteServer.write(Relabel, writer(backend.Db().Part))],
    })
    return Effect.runPromise(
      RemoteServer.handlers(server, null)
        .FoldkitRemoteMutate({ requestId: 'r', mutation: 'Relabel', input })
        .pipe(Effect.result, Effect.provide(backend.layer())),
    )
  }

  it('is computed in the statement that writes, and answered', async () => {
    await backend.fresh()
    expect(await send({ id: 'p1', revision: 1, prefix: 'o' })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ values: { label: 'oned', revision: 2 } }] },
    })
    expect(await backend.row()).toEqual({ label: 'oned', score: 10, revision: 2 })
  })

  it('is judged by the invariants over the value it computes, and refused as that invariant', async () => {
    await backend.fresh()
    expect(await send({ id: 'p1', revision: 1, prefix: 'ban' })).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Invalid', rule: 'notBanned', path: ['label'] } },
    })
    expect(await backend.row()).toEqual({ label: 'plain', score: 10, revision: 1 })
  })

  it('is not computed twice by a retry of one that landed', async () => {
    await backend.fresh()
    expect((await send({ id: 'p1', revision: 1, prefix: 'o' }))._tag).toBe('Success')
    // The same write again: past its revision, and a computation does not repeat without effect.
    expect(await send({ id: 'p1', revision: 1, prefix: 'o' })).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Conflict' } },
    })
    expect(await backend.row()).toEqual({ label: 'oned', score: 10, revision: 2 })
  })
})

/** Selects a call from SQLite: how a binding's SQL implementation's laws are tested. */
const selectingSqlite =
  (Db: ReturnType<(typeof backends)[0][1]['Db']>) =>
  async (call: Parameters<typeof compileCall>[0]) => {
    const query = new SQLiteDialect().sqlToQuery(
      sql`select ${compileCall(call, Db.Part, 'laws')} as value` as SQL,
    )
    const value = (
      sqlite.prepare(query.sql).get(...(query.params as Array<number>)) as {
        value: unknown
      }
    ).value
    return isPredicate(call) && typeof value === 'number' ? value === 1 : value
  }

describe('A computed assignment without a revision, under a ledger', () => {
  const schema = `${create}; ${seed}; create table write_ledger (
    scope text not null, operation text not null, target text not null, answer text not null, at integer not null,
    primary key (scope, operation, target))`
  const served = (operators: { readonly memory: typeof memory; readonly sql: typeof sqlTable }) =>
    RemoteServer.write(
      Score,
      writer<string>(bind({ Part }, { Part: { table: sqliteParts } }, { operators }).Part, {
        ledger: { table: ledgerTable, scope: principal => principal },
      }),
    )
  const tested = async () => {
    const memoryVerdict = Conformance.laws(add, memory)
    const Db = bind(
      { Part },
      { Part: { table: sqliteParts } },
      { operators: { memory, sql: sqlTable } },
    )
    const sqlVerdict = await Conformance.lawsBy(add, selectingSqlite(Db), {
      implementation: 'sqlite',
    })
    if (memoryVerdict._tag !== 'Holds' || sqlVerdict._tag !== 'Holds') {
      throw new Error('integer addition did not hold its laws')
    }
    return {
      memory: Operators.withEvidence(memory, memoryVerdict.evidence),
      sql: DrizzleOperators.withEvidence(sqlTable, sqlVerdict.evidence),
    }
  }

  it('is refused where it is served until both implementations are shown to commute', async () => {
    const message = 'write "Score" computes "score" and expects no revision'
    expect(() => served({ memory, sql: sqlTable })).toThrow(message)
    const evidence = await tested()
    expect(() => served({ memory: evidence.memory, sql: sqlTable })).toThrow(message)
    expect(() => served({ memory, sql: evidence.sql })).toThrow(message)
    expect(() => served(evidence)).not.toThrow()
  })

  it('is refused for an assignment not of its own field by an amount, whatever the evidence', async () => {
    const evidence = await tested()
    const Db = bind({ Part }, { Part: { table: sqliteParts } }, { operators: evidence })
    const ledgered = writer<string>(Db.Part, {
      ledger: { table: ledgerTable, scope: principal => principal },
    })
    const input = Entity.input(Part, Schema.Struct({ id: Schema.String, by: Schema.Int }), {
      by: Entity.unmapped,
    })
    // The field second, and an amount that reads the row: neither lands in any order as one.
    const Swapped = Mutation.write(
      'Swapped',
      Write.update(input, {
        id: 'id',
        compute: { score: ({ row, input: given }) => add(given.by, row.score) },
      }),
    )
    const Doubled = Mutation.write(
      'Doubled',
      Write.update(input, { id: 'id', compute: { score: ({ row }) => add(row.score, row.score) } }),
    )
    expect(() => RemoteServer.write(Swapped, ledgered)).toThrow(
      'write "Swapped" computes "score" and expects no revision',
    )
    expect(() => RemoteServer.write(Doubled, ledgered)).toThrow(
      'write "Doubled" computes "score" and expects no revision',
    )
  })

  it('is refused through a writer with no ledger, which cannot tell a retry from a second write', async () => {
    const plain = writer(
      bind({ Part }, { Part: { table: sqliteParts } }, { operators: await tested() }).Part,
    )
    expect(() => RemoteServer.write(Score, plain)).toThrow(
      'write "Score" computes a field and expects no revision, so a retry could compute twice',
    )
  })

  it('needs an operation id, which keys its record', async () => {
    sqlite.exec(`drop table if exists parts; drop table if exists write_ledger; ${schema}`)
    const server = RemoteServer.make<string, DrizzleDatabase>({
      entities: [],
      mutations: [served(await tested())],
    })
    expect(
      await Effect.runPromise(
        RemoteServer.handlers(server, 'ada')
          .FoldkitRemoteMutate({ requestId: 'r', mutation: 'Score', input: { id: 'p1', by: 1 } })
          .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
      ),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { message: 'Score moves a field with no revision, so it needs an operation id' },
    })
    expect(sqlite.prepare('select score from parts').get()).toEqual({ score: 10 })
  })

  it('lands two writes made from one read, and a retry of one once', async () => {
    sqlite.exec(`drop table if exists parts; drop table if exists write_ledger; ${schema}`)
    const server = RemoteServer.make<string, DrizzleDatabase>({
      entities: [],
      mutations: [served(await tested())],
    })
    const send = (by: number, operation: string) =>
      Effect.runPromise(
        RemoteServer.handlers(server, 'ada')
          .FoldkitRemoteMutate({
            requestId: 'r',
            mutation: 'Score',
            input: { id: 'p1', by },
            operation,
          })
          .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
      )
    expect((await send(5, 'op-a'))._tag).toBe('Success')
    expect((await send(3, 'op-b'))._tag).toBe('Success')
    expect((await send(5, 'op-a'))._tag).toBe('Success')
    expect(sqlite.prepare('select score from parts').get()).toEqual({ score: 18 })
  })
})

describe("A SQL table's evidence", () => {
  const record = async () => {
    const Db = bind(
      { Part },
      { Part: { table: sqliteParts } },
      { operators: { memory, sql: sqlTable } },
    )
    const verdict = await Conformance.lawsBy(add, selectingSqlite(Db), { implementation: 'sqlite' })
    return verdict._tag === 'Holds' ? verdict.evidence : []
  }

  it('refuses a record of an operator it does not implement, or of a law not declared', async () => {
    const evidence = await record()
    expect(() => DrizzleOperators.withEvidence(DrizzleOperators.kernel, evidence)).toThrow(
      'evidence names acme.add, which this table does not implement',
    )
    expect(() =>
      DrizzleOperators.withEvidence(sqlTable, [
        { ...evidence[0]!, law: Law.describe(Law.idempotent) },
      ]),
    ).toThrow('evidence names a law of acme.add it does not declare (idempotent)')
  })

  it('keeps its records through a merge, and drops a replaced implementation’s', async () => {
    const table = DrizzleOperators.withEvidence(sqlTable, await record())
    expect(DrizzleOperators.merge(table, DrizzleOperators.kernel).evidence).toHaveLength(2)
    expect(
      DrizzleOperators.override(
        table,
        DrizzleOperators.implement(add, ({ args: [left, right] }) => sql`(${right} + ${left})`),
      ).evidence,
    ).toEqual([])
  })
})

describe('A computed assignment the binding cannot run', () => {
  it('is refused where it is served, by the operator its table lacks', () => {
    const bare = bind({ Part }, { Part: { table: sqliteParts } })
    expect(() => RemoteServer.write(Relabel, writer(bare.Part))).toThrow(
      'its assignment to "label" needs acme.concat, which this compiler does not run',
    )
  })

  it('is refused under a writer that computes nothing', () => {
    const { assignments: _, ...plain } = writer(backends[0][1].Db().Part)
    expect(() => RemoteServer.write(Relabel, plain)).toThrow(
      'write "Relabel" computes a field, but its writer for Part does not compute one (assignments)',
    )
  })
})
