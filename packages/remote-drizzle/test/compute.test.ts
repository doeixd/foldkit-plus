/**
 * Computed assignments through the Drizzle writer: compiled into the
 * statement that writes, judged by the Entity's invariants in SQL and
 * explained in memory by the same row, never repeated by a retry, and landed
 * without a revision only by an operator shown to commute.
 * expr-operations-DESIGN §9.2, §9.3.
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { SQLiteDialect, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Collation, Entity, Expr, Operators, Write } from 'foldkit-entity'
import { Node } from 'metakit'
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

postgres()

const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
})
/** Integer addition: commutes and associates. */
const add = Expr.operator('acme.add', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
  claims: { commutative: true, associative: true },
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
).pipe(
  Entity.annotateMembers({
    name: Collation.of(Collation.binary),
    label: Collation.of(Collation.binary),
  }),
)
const Part = Fields.pipe(
  Entity.invariant('notBanned', ({ after }) => Expr.not(Expr.eq(after.label, 'banned')), {
    message: 'That label is banned',
    path: ['label'],
  }),
  // Orders the computed label under its collation, which each dialect writes its own way.
  Entity.invariant('beforeX', ({ after }) => Expr.lt(after.label, 'x'), {
    message: 'Labels sort before x',
    path: ['label'],
  }),
)
/**
 * The same with the computed value second, beside a stored field. Its own
 * Entity: an invariant reading `name` would make every miss of `Part` read it,
 * hiding whether a miss reads what its computation reads.
 */
const Ordered = Part.pipe(
  Entity.invariant('afterName', ({ after }) => Expr.lte(after.name, after.label), {
    message: 'Labels sort after the name',
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
    request: text('request'),
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
/** `Relabel`, over `Ordered`. */
const RelabelOrdered = Mutation.write(
  'RelabelOrdered',
  Write.update(
    Entity.input(
      Ordered,
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
      Ordered: () =>
        bind(
          { Part: Ordered },
          { Part: { table: sqliteParts } },
          { operators: { memory, sql: sqlTable } },
        ),
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
      Ordered: () =>
        bind(
          { Part: Ordered },
          { Part: { table: pgParts } },
          { operators: { memory, sql: sqlTable } },
        ),
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

  it('orders the value it computes under the field’s collation', async () => {
    await backend.fresh()
    expect(await send({ id: 'p1', revision: 1, prefix: 'y' })).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Invalid', rule: 'beforeX' } },
    })
  })

  it('orders a computed value second, beside a stored field, under its collation', async () => {
    await backend.fresh()
    const server = RemoteServer.make<null, DrizzleDatabase>({
      entities: [],
      mutations: [RemoteServer.write(RelabelOrdered, writer(backend.Ordered().Part))],
    })
    const answer = await Effect.runPromise(
      RemoteServer.handlers(server, null)
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'RelabelOrdered',
          // 'aned' sorts before 'ned'.
          input: { id: 'p1', revision: 1, prefix: 'a' },
        })
        .pipe(Effect.result, Effect.provide(backend.layer())),
    )
    expect(answer).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Invalid', rule: 'afterName' } },
    })
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
    // SQLite answers a truth as 1 or 0.
    const truth = Node.$is('Call')(call.node) && call.node.op.returns === 'boolean'
    return truth && typeof value === 'number' ? value === 1 : value
  }

describe('A computed assignment without a revision, under a ledger', () => {
  const schema = `${create}; ${seed}; create table write_ledger (
    scope text not null, operation text not null, target text not null, answer text not null, at integer not null, request text,
    primary key (scope, operation, target))`
  const served = (operators: { readonly memory: typeof memory; readonly sql: typeof sqlTable }) =>
    RemoteServer.write(
      Score,
      writer<string>(bind({ Part }, { Part: { table: sqliteParts } }, { operators }).Part, {
        ledger: { table: ledgerTable, scope: principal => principal },
      }),
    )
  const commuting = { memory, sql: sqlTable }

  it('requires an implementation in both the memory and SQL tables', () => {
    const message = 'write "Score" computes "score" and expects no revision'
    expect(() => served({ memory: Operators.kernel, sql: sqlTable })).toThrow(message)
    expect(() => served({ memory, sql: DrizzleOperators.kernel })).toThrow(message)
    expect(() => served(commuting)).not.toThrow()
  })

  it('requires the assigned field first and an amount independent of the row', () => {
    const Db = bind({ Part }, { Part: { table: sqliteParts } }, { operators: commuting })
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

  it('is refused through a writer with no ledger, which cannot tell a retry from a second write', () => {
    const plain = writer(
      bind({ Part }, { Part: { table: sqliteParts } }, { operators: commuting }).Part,
    )
    expect(() => RemoteServer.write(Score, plain)).toThrow(
      'write "Score" computes a field and expects no revision, so a retry could compute twice',
    )
  })

  it('needs an operation id, which keys its record', async () => {
    sqlite.exec(`drop table if exists parts; drop table if exists write_ledger; ${schema}`)
    const server = RemoteServer.make<string, DrizzleDatabase>({
      entities: [],
      mutations: [served(commuting)],
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
      mutations: [served(commuting)],
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

describe('Claims for a computed assignment without a revision', () => {
  it.each([
    ['associativity alone', { associative: true }],
    ['commutativity alone', { commutative: true }],
    ['conditional associativity', { commutative: true, associative: { unlessRefused: true } }],
  ] as const)('refuses %s', (_, claims) => {
    const addSome = Expr.operator('acme.addSome', {
      input: [Schema.Int, Schema.Int],
      output: Schema.Int,
      claims,
    })
    const tables = {
      memory: Operators.memory(Operators.implement(addSome, (left, right) => left + right)),
      sql: DrizzleOperators.make(
        DrizzleOperators.implement(addSome, ({ args: [left, right] }) => sql`(${left} + ${right})`),
      ),
    }
    const ScoreSome = Mutation.write(
      'ScoreSome',
      Write.update(
        Entity.input(Part, Schema.Struct({ id: Schema.String, by: Schema.Int }), {
          by: Entity.unmapped,
        }),
        { id: 'id', compute: { score: ({ row, input }) => addSome(row.score, input.by) } },
      ),
    )
    const Db = bind({ Part }, { Part: { table: sqliteParts } }, { operators: tables })
    expect(() =>
      RemoteServer.write(
        ScoreSome,
        writer<string>(Db.Part, { ledger: { table: ledgerTable, scope: principal => principal } }),
      ),
    ).toThrow('write "ScoreSome" computes "score" and expects no revision')
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
