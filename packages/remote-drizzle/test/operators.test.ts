/**
 * Primitive operators compiled by a binding's SQL table, beside its memory
 * table: expr-operations-DESIGN §5.4 to §5.6.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer as pgInteger, PgDialect, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, SQLiteDialect, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import {
  Collation,
  Entity,
  Expr,
  Operators,
  Order,
  Query as Relational,
  Write,
} from 'foldkit-entity'
import { Mutation, Query } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compilePredicates } from '../src/compile.js'
import { DrizzleOperators, bind, databaseLayer, entity, query, writer } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, code: Schema.String, rank: Schema.Int }),
).pipe(Entity.annotateMembers({ code: Collation.of(Collation.binary) }))

/** A sum of two numbers: the plainest operator a parameter's type matters to. */
const sum = Expr.operator('acme.sum', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
})
/** Text after text, carrying its operands' collation. */
const joined = Expr.operator('acme.joined', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
})
const operators = {
  memory: Operators.merge(
    Operators.kernel,
    Operators.memory(
      Operators.implement(sum, (left, right) => left + right),
      Operators.implement(joined, (left, right) => `${left}${right}`),
    ),
  ),
  sql: DrizzleOperators.merge(
    DrizzleOperators.kernel,
    DrizzleOperators.make(
      DrizzleOperators.implement(sum, ({ args: [left, right] }) => sql`(${left} + ${right})`),
      DrizzleOperators.implement(joined, ({ args: [left, right] }) => sql`(${left} || ${right})`),
    ),
  ),
}

const sqliteItems = sqliteTable('items', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  rank: integer('rank').notNull(),
})
const pgItems = pgTable('items', {
  id: pgText('id').primaryKey(),
  code: pgText('code').notNull(),
  rank: pgInteger('rank').notNull(),
})
const onSqlite = entity('Item', sqliteItems, { operators })
const onPostgres = entity('Item', pgItems, { operators })
const bare = entity('Item', sqliteItems)

const renderedPg = (value: SQL) => new PgDialect().sqlToQuery(value)
const renderedSqlite = (value: SQL) => new SQLiteDialect().sqlToQuery(value)

const a = Expr.input('a', Schema.Int)
const b = Expr.input('b', Schema.Int)
/** A body comparing two parameters' sum with a column: Postgres cannot type `$1 + $2` alone. */
const ranked = Relational.from(Item).pipe(
  Relational.where(Expr.eq(Item.fields.rank, sum(a, b))),
  Relational.orderBy(Order.asc(Item.fields.id)),
)

describe('A primitive operator in SQL', () => {
  it('compiles by its implementation, each parameter cast to its stored type on Postgres', () => {
    const [onPg] = compilePredicates(ranked.where, onPostgres, { a: 1, b: 2 }, 'Ranked')
    expect(renderedPg(onPg!).sql).toBe('"items"."rank" = (cast($1 as bigint) + cast($2 as bigint))')
    // SQLite takes no cast: its `cast(? as integer)` would truncate a fraction silently.
    const [onLite] = compilePredicates(ranked.where, onSqlite, { a: 1, b: 2 }, 'Ranked')
    expect(renderedSqlite(onLite!).sql).toBe('"items"."rank" = (? + ?)')
  })

  it('casts a real number as one, and text not at all', () => {
    const half = Expr.operator('acme.half', { input: [Schema.Number], output: Schema.Number })
    const table = {
      memory: Operators.memory(Operators.implement(half, value => value / 2)),
      sql: DrizzleOperators.make(
        DrizzleOperators.implement(half, ({ args: [value] }) => sql`(${value} / 2)`),
      ),
    }
    const target = entity('Item', pgItems, { operators: table })
    const [halved] = compilePredicates(
      [Expr.eq(Item.fields.rank, half(Expr.input('n', Schema.Number)))],
      target,
      { n: 3 },
      'Halved',
    )
    expect(renderedPg(halved!).sql).toBe('"items"."rank" = (cast($1 as double precision) / 2)')
    const [glued] = compilePredicates(
      [Expr.eq(joined(Item.fields.code, Expr.input('s', Schema.String)), 'AB')],
      onPostgres,
      { s: '!' },
      'Glued',
    )
    expect(renderedPg(glued!).sql).toBe('("items"."code" || $1) = $2')
  })

  it('casts a boolean as one', () => {
    const ranked = Expr.operator('acme.ranked', {
      input: [Schema.Int, Schema.Boolean],
      output: Schema.Boolean,
    })
    const table = {
      memory: Operators.memory(Operators.implement(ranked, (rank, flag) => rank > 0 && flag)),
      sql: DrizzleOperators.make(
        DrizzleOperators.implement(
          ranked,
          ({ args: [rank, flag] }) => sql`(${rank} > 0 and ${flag})`,
        ),
      ),
    }
    const [compiled] = compilePredicates(
      [ranked(Item.fields.rank, Expr.input('flag', Schema.Boolean))],
      entity('Item', pgItems, { operators: table }),
      { flag: true },
      'Ranked',
    )
    expect(renderedPg(compiled!).sql).toBe('("items"."rank" > 0 and cast($1 as boolean))')
  })

  it("compares a call's text under the collation it carries", () => {
    const [ordered] = compilePredicates(
      [Expr.lt(joined(Item.fields.code, '!'), 'B')],
      onPostgres,
      {},
      'Ordered',
    )
    expect(renderedPg(ordered!).sql).toBe('(("items"."code" || $1) collate "C") < ($2 collate "C")')
    const [folded] = compilePredicates(
      [Expr.lt(joined(Item.fields.code, '!', { collation: Collation.asciiFold }), 'b')],
      onSqlite,
      {},
      'Folded',
    )
    expect(renderedSqlite(folded!).sql).toBe(
      '(("items"."code" || ?) collate nocase) < (? collate nocase)',
    )
  })

  it('refuses text holding NUL given to an operator', () => {
    expect(() =>
      compilePredicates(
        [Expr.eq(joined(Item.fields.code, Expr.input('s', Schema.String)), 'x')],
        onSqlite,
        { s: `a${String.fromCharCode(0)}` },
        'Nul',
      ),
    ).toThrow('gives an operator text holding a NUL character')
  })

  it('is refused by name where the binding lacks it, compiling or registering', () => {
    expect(() => compilePredicates(ranked.where, bare, { a: 1, b: 2 }, 'Ranked')).toThrow(
      'query "Ranked" calls the operator "acme.sum", which this binding\'s SQL operators do not run',
    )
    const descriptor = {
      ...Query.make('Ranked', {
        Input: { a: Schema.Int, b: Schema.Int },
        Result: Query.connection(Item),
      }),
      body: ranked,
    }
    expect(() => query(descriptor, { entity: bare })).toThrow(
      'query "Ranked" needs acme.sum, which this compiler does not run',
    )
  })

  it('is refused naming the version the binding holds, for a body calling another', () => {
    const later = Expr.operator('acme.sum', {
      input: [Schema.Int, Schema.Int],
      output: Schema.Int,
      version: 2,
    })
    const descriptor = {
      ...Query.make('Later', { Input: {}, Result: Query.connection(Item) }),
      body: Relational.from(Item).pipe(
        Relational.where(Expr.eq(Item.fields.rank, later(1, 2))),
        Relational.orderBy(Order.asc(Item.fields.id)),
      ),
    }
    expect(() => query(descriptor, { entity: onSqlite })).toThrow(
      'query "Later" needs acme.sum@2 (this table has acme.sum), which this compiler does not run',
    )
  })

  it('is refused at registration where only the memory table lacks it', () => {
    const sqlOnly = entity('Item', sqliteItems, {
      operators: { sql: operators.sql },
    })
    const descriptor = {
      ...Query.make('Ranked', {
        Input: { a: Schema.Int, b: Schema.Int },
        Result: Query.connection(Item),
      }),
      body: ranked,
    }
    expect(() => query(descriptor, { entity: sqlOnly })).toThrow(
      'query "Ranked" needs acme.sum, which this binding\'s memory operators do not run',
    )
  })
})

describe('A primitive operator run by the database', () => {
  const descriptor = {
    ...Query.make('Ranked', {
      Input: { a: Schema.Int, b: Schema.Int },
      Result: Query.connection(Item),
    }),
    body: ranked,
  }
  const rows = [
    ['i1', 'AB', 3],
    ['i2', 'CD', 5],
  ] as const
  const ids = (
    target: typeof onSqlite | typeof onPostgres,
    layer: ReturnType<typeof databaseLayer>,
    input: { readonly a: number; readonly b: number } = { a: 1, b: 2 },
  ) =>
    Effect.runPromise(
      query(descriptor, { entity: target })
        .run({ input, window: { first: 5 }, principal: null })
        .pipe(
          Effect.map(page => page.edges.map(edge => edge.id)),
          Effect.provide(layer),
        ),
    )

  it('answers on SQLite', async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(
      'create table items (id text primary key, code text not null, rank integer not null)',
    )
    for (const row of rows) sqlite.prepare('insert into items values (?, ?, ?)').run(...row)
    expect(await ids(onSqlite, databaseLayer(drizzle({ client: sqlite })))).toEqual(['i1'])
    sqlite.close()
  })

  it('binds a boolean on SQLite as SQLite stores one', async () => {
    const flagged = Expr.operator('acme.flagged', {
      input: [Schema.Int, Schema.Boolean],
      output: Schema.Boolean,
    })
    const table = {
      memory: Operators.memory(Operators.implement(flagged, (rank, flag) => rank > 4 === flag)),
      sql: DrizzleOperators.make(
        DrizzleOperators.implement(
          flagged,
          ({ args: [rank, flag] }) => sql`((${rank} > 4) = ${flag})`,
        ),
      ),
    }
    const Flagged = {
      ...Query.make('Flagged', { Input: { flag: Schema.Boolean }, Result: Query.connection(Item) }),
      body: Relational.from(Item).pipe(
        Relational.where(flagged(Item.fields.rank, Expr.input('flag', Schema.Boolean))),
        Relational.orderBy(Order.asc(Item.fields.id)),
      ),
    }
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(
      'create table items (id text primary key, code text not null, rank integer not null)',
    )
    for (const row of rows) sqlite.prepare('insert into items values (?, ?, ?)').run(...row)
    const run = (flag: boolean) =>
      Effect.runPromise(
        query(Flagged, { entity: entity('Item', sqliteItems, { operators: table }) })
          .run({ input: { flag }, window: { first: 5 }, principal: null })
          .pipe(
            Effect.map(page => page.edges.map(edge => edge.id)),
            Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
          ),
      )
    expect(await run(true)).toEqual(['i2'])
    expect(await run(false)).toEqual(['i1'])
    sqlite.close()
  })

  describe('on Postgres', () => {
    const pglite = new PGlite()
    beforeAll(async () => {
      await pglite.exec(
        'create table items (id text primary key, code text not null, rank integer not null)',
      )
      for (const row of rows) await pglite.query('insert into items values ($1, $2, $3)', [...row])
    }, 60_000)
    afterAll(() => pglite.close())

    it('answers, its parameters cast where Postgres cannot type them', async () => {
      expect(await ids(onPostgres, databaseLayer(drizzlePg({ client: pglite })))).toEqual(['i1'])
    })

    it('takes any integer Schema.Int admits, past the 32 bits of an integer', async () => {
      const input = { a: 3_000_000_000, b: -2_999_999_997 }
      expect(await ids(onPostgres, databaseLayer(drizzlePg({ client: pglite })), input)).toEqual([
        'i1',
      ])
    })
  })
})

describe('DrizzleOperators', () => {
  const sumSql = DrizzleOperators.implement(
    sum,
    ({ args: [left, right] }) => sql`(${left} + ${right})`,
  )

  it('refuses one operator implemented twice, or two under one name', () => {
    expect(() => DrizzleOperators.make(sumSql, sumSql)).toThrow('acme.sum is implemented twice')
    const twin = Expr.operator('acme.sum', { input: [Schema.Int, Schema.Int], output: Schema.Int })
    expect(() =>
      DrizzleOperators.make(
        sumSql,
        DrizzleOperators.implement(twin, () => sql`0`),
      ),
    ).toThrow('two operators are named acme.sum')
  })

  it('refuses a merge implementing one operator on both sides, and overrides on request', () => {
    const one = DrizzleOperators.make(sumSql)
    expect(() => DrizzleOperators.merge(one, DrizzleOperators.make(sumSql))).toThrow(
      'both tables implement acme.sum; replace with DrizzleOperators.override',
    )
    const replaced = DrizzleOperators.override(
      one,
      DrizzleOperators.implement(sum, () => sql`42`),
    )
    expect(replaced.implementations).toHaveLength(1)
    expect(replaced.implementations[0]!.operator).toBe(sum.descriptor)
    expect(replaced.implementations[0]).not.toBe(sumSql)
  })
})

describe('A writer over a binding', () => {
  const RankInput = Entity.input(Item, Schema.Struct({ id: Schema.String, rank: Schema.Int }))

  it('refuses a precondition calling an operator its binding does not run, where it is served', () => {
    const Rerank = Mutation.write(
      'Rerank',
      Write.update(RankInput, {
        id: 'id',
        when: () => Expr.eq(Item.fields.rank, sum(1, 2)),
      }),
    )
    expect(() => RemoteServer.write(Rerank, writer(bare))).toThrow(
      'write "Rerank" cannot land through its writer for Item: its precondition needs acme.sum, which this compiler does not run',
    )
    expect(() => RemoteServer.write(Rerank, writer(onSqlite))).not.toThrow()
  })

  it('refuses to be built over an invariant calling an operator its binding does not run', () => {
    const Bounded = Item.pipe(
      Entity.invariant('bounded', ({ after }) => Expr.lt(sum(after.rank, 1), 100), {
        message: 'Too high',
      }),
    )
    const storage = { Bounded: { table: sqliteItems } }
    expect(() => writer(bind({ Bounded }, storage).Bounded)).toThrow(
      'Item\'s invariant "bounded" needs acme.sum, which this compiler does not run',
    )
    expect(() => writer(bind({ Bounded }, storage, { operators }).Bounded)).not.toThrow()
  })

  it("judges a write's row in memory by its binding's table, naming the invariant it breaks", async () => {
    const Bounded = Item.pipe(
      Entity.invariant('bounded', ({ after }) => Expr.lt(sum(after.rank, 1), 100), {
        message: 'Too high',
      }),
    )
    const Db = bind({ Bounded }, { Bounded: { table: sqliteItems } }, { operators })
    const Create = Mutation.write(
      'Create',
      Write.insert(
        Entity.input(
          Bounded,
          Schema.Struct({ id: Schema.String, code: Schema.String, rank: Schema.Int }),
        ),
        { id: 'id' },
      ),
    )
    // Its precondition calls the operator too, so a miss is explained in memory.
    const Raise = Mutation.write(
      'Raise',
      Write.update(Entity.input(Bounded, Schema.Struct({ id: Schema.String, rank: Schema.Int })), {
        id: 'id',
        when: () => Expr.eq(Bounded.fields.rank, sum(1, 2)),
      }),
    )
    const handlers = RemoteServer.handlers(
      RemoteServer.make({
        entities: [],
        mutations: [
          RemoteServer.write(Create, writer(Db.Bounded)),
          RemoteServer.write(Raise, writer(Db.Bounded)),
        ],
      }),
      undefined,
    )
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(
      "create table items (id text primary key, code text not null, rank integer not null); insert into items values ('i1', 'AB', 3)",
    )
    const send = (mutation: string, input: unknown) =>
      Effect.runPromise(
        handlers
          .FoldkitRemoteMutate({ requestId: mutation, mutation, input })
          .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
      )
    const broken = {
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Invalid', rule: 'bounded' } },
    }
    expect(await send('Create', { id: 'i2', code: 'CD', rank: 200 })).toMatchObject(broken)
    // The statement misses; the precondition held, so the invariant is why.
    expect(await send('Raise', { id: 'i1', rank: 200 })).toMatchObject(broken)
    sqlite.close()
  })
})
