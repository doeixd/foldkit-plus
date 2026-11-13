/**
 * `RemoteServer.memoryWriter` against this package's writer over SQLite: one
 * table of declared writes run through both, each answer and the rows left
 * compared, so the memory writer decides what the statement decides.
 */
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Expr, Operators, Relation, Write } from 'foldkit-entity'
import { Mutation, Remote, refParts } from 'foldkit-remote'
import { RemoteServer, type EntityWriter, type MemoryStore } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { DrizzleOperators, bind, databaseLayer, writer } from '../src/index.js'

const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
})
const memory = Operators.memory(Operators.implement(concat, (left, right) => `${left}${right}`))
const sqlOperators = DrizzleOperators.make(
  DrizzleOperators.implement(concat, ({ args: [left, right] }) => sql`(${left} || ${right})`),
)

const OwnerFields = Entity.define('Owner', Schema.Struct({ id: Schema.String }))
const StockFields = Entity.define(
  'Stock',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    label: Schema.String,
    status: Schema.String,
    quantity: Schema.Int,
    reserved: Schema.Int,
    revision: Schema.Int,
  }),
)
const Related = Entity.relate(
  { Owner: OwnerFields, Stock: StockFields },
  { Stock: { owner: Relation.one(OwnerFields) } },
)
const { Owner } = Related
const Stock = Related.Stock.pipe(
  Entity.invariant(
    'reservedWithinQuantity',
    ({ after }) => Expr.lte(after.reserved, after.quantity),
    { message: 'Reserved stock cannot exceed the quantity', path: ['reserved'] },
  ),
  // Reads a link, which an invariant reads as the id it points at.
  Entity.invariant(
    'ownerInGoodStanding',
    ({ after }) => Expr.not(Expr.eq(after.owner, 'blocked')),
    {
      message: 'That owner may not hold stock',
    },
  ),
)

const Reserve = Mutation.write(
  'Reserve',
  Write.update(
    Entity.input(
      Stock,
      Schema.Struct({ id: Schema.String, revision: Schema.Int, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      when: () => Expr.eq(Stock.fields.status, 'published'),
      increment: { reserved: 'quantity' },
    },
  ),
)
const Rename = Mutation.write(
  'Rename',
  Write.update(
    Entity.input(
      Stock,
      Schema.Struct({
        id: Schema.String,
        revision: Schema.Int,
        name: Schema.String,
        prefix: Schema.String,
      }),
      { prefix: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      compute: { label: ({ row, input }) => concat(input.prefix, row.name) },
    },
  ),
)
const Relabel = Mutation.write(
  'Relabel',
  Write.update(
    Entity.input(
      Stock,
      Schema.Struct({ id: Schema.String, revision: Schema.Int, label: Schema.String }),
    ),
    { id: 'id', expect: 'revision' },
  ),
)
const Restock = Mutation.write(
  'Restock',
  Write.update(Entity.input(Stock, Schema.Struct({ id: Schema.String, quantity: Schema.Int })), {
    id: 'id',
  }),
)
const List = Mutation.write(
  'List',
  Write.insert(
    Entity.input(
      Stock,
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        label: Schema.String,
        status: Schema.String,
        quantity: Schema.Int,
        reserved: Schema.Int,
        revision: Schema.Int,
        ownerId: Schema.String,
      }),
      { ownerId: 'owner' },
    ),
    { id: 'id' },
  ),
)
const Withdraw = Mutation.write(
  'Withdraw',
  Write.delete(Entity.input(Stock, Schema.Struct({ id: Schema.String, revision: Schema.Int })), {
    id: 'id',
    expect: 'revision',
    when: () => Expr.eq(Stock.fields.status, 'draft'),
  }),
)
const mutations = [Reserve, Rename, Relabel, Restock, List, Withdraw]
/** Each write through `writer`: listed one by one, since their inputs differ. */
const writes = <P, R>(through: EntityWriter<P, R>) => [
  RemoteServer.write(Reserve, through),
  RemoteServer.write(Rename, through),
  RemoteServer.write(Relabel, through),
  RemoteServer.write(Restock, through),
  RemoteServer.write(List, through),
  RemoteServer.write(Withdraw, through),
]

const owners = sqliteTable('owners', { id: text('id').primaryKey() })
const stock = sqliteTable('stock', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  label: text('label').notNull(),
  status: text('status').notNull(),
  quantity: integer('quantity').notNull(),
  reserved: integer('reserved').notNull(),
  revision: integer('revision').notNull(),
  ownerId: text('owner_id').notNull(),
})
const Db = bind(
  { Owner, Stock },
  {
    Owner: { table: owners },
    Stock: { table: stock, relations: { owner: { field: stock.ownerId } } },
  },
  { operators: { memory, sql: sqlOperators } },
)

type Stored = Readonly<Record<string, unknown>>
const row = (id: string, status: string, quantity: number, reserved: number): Stored => ({
  id,
  name: 'Bolt',
  label: 'bolt',
  status,
  quantity,
  reserved,
  revision: 1,
  owner: 'Owner:o1',
})
const seed = [
  row('s1', 'published', 10, 5),
  row('s2', 'draft', 10, 0),
  { ...row('s4', 'draft', 10, 0), owner: 'Owner:blocked' },
]

/** Sends each write in turn, and answers each outcome and the rows it left. */
type Run = (
  sends: ReadonlyArray<readonly [string, unknown]>,
) => Promise<{ readonly outcomes: ReadonlyArray<unknown>; readonly rows: ReadonlyArray<Stored> }>

/** What a client is told: the patch it reads, or the refusal it decodes, as the wire carries them. */
const outcomeOf = (result: unknown): unknown => JSON.parse(JSON.stringify(result))

const sendAll = async (
  sends: ReadonlyArray<readonly [string, unknown]>,
  send: (request: {
    readonly requestId: string
    readonly mutation: string
    readonly input: unknown
  }) => Effect.Effect<unknown, unknown>,
) => {
  const outcomes: Array<unknown> = []
  for (const [at, [mutation, input]] of sends.entries()) {
    const result = await Effect.runPromise(
      send({ requestId: `r${at}`, mutation, input }).pipe(Effect.result),
    )
    outcomes.push(outcomeOf(result))
  }
  return outcomes
}

const inMemory: Run = async sends => {
  const backend = RemoteServer.memory({
    domain: Remote.define({ entities: [Owner, Stock], mutations }),
    rows: {
      Owner: [{ id: 'o1' }, { id: 'blocked' }],
      Stock: seed.map(each => ({ ...each, id: String(each.id) })),
    },
    operators: memory,
    mutations: (store: MemoryStore) =>
      writes(RemoteServer.memoryWriter(store, Stock, { operators: memory })),
  })
  const handlers = RemoteServer.handlers(backend.server, undefined)
  const outcomes = await sendAll(sends, handlers.FoldkitRemoteMutate)
  const rows = [...backend.rows('Stock')].sort((left, right) =>
    String(left['id']).localeCompare(String(right['id'])),
  )
  return { outcomes, rows }
}

const overSqlite: Run = async sends => {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    create table owners (id text primary key);
    create table stock (id text primary key, name text not null, label text not null,
      status text not null, quantity integer not null, reserved integer not null,
      revision integer not null, owner_id text not null references owners(id));
    insert into owners values ('o1'), ('blocked');
  `)
  const insert = database.prepare('insert into stock values (?, ?, ?, ?, ?, ?, ?, ?)')
  for (const each of seed)
    insert.run(
      String(each['id']),
      String(each['name']),
      String(each['label']),
      String(each['status']),
      Number(each['quantity']),
      Number(each['reserved']),
      Number(each['revision']),
      refParts(String(each['owner'])).id,
    )
  const server = RemoteServer.make({
    entities: [],
    mutations: writes(writer(Db.Stock)),
  })
  const layer = databaseLayer(drizzle({ client: database }))
  const handlers = RemoteServer.handlers(server, undefined)
  const outcomes = await sendAll(sends, request =>
    Effect.provide(handlers.FoldkitRemoteMutate(request), layer),
  )
  const rows = database
    .prepare('select * from stock order by id')
    .all()
    .map(({ owner_id, ...rest }) => ({ ...rest, owner: `Owner:${String(owner_id)}` }))
  return { outcomes, rows }
}

const listed = { ...row('s3', 'draft', 4, 1), ownerId: 'o1' }

const cases: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, unknown]>]> = [
  ['an update with an increment', [['Reserve', { id: 's1', revision: 1, quantity: 3 }]]],
  [
    'an update computing over the row before it',
    [['Rename', { id: 's1', revision: 1, name: 'Nut', prefix: 'new ' }]],
  ],
  ['an update with no revision', [['Restock', { id: 's2', quantity: 12 }]]],
  ['an insert', [['List', listed]]],
  ['a delete', [['Withdraw', { id: 's2', revision: 1 }]]],
  ['a delete of a row not there', [['Withdraw', { id: 's9', revision: 1 }]]],
  ['a stale revision', [['Reserve', { id: 's1', revision: 7, quantity: 1 }]]],
  ['an update of a row not there', [['Reserve', { id: 's9', revision: 1, quantity: 1 }]]],
  ['a row not published', [['Reserve', { id: 's2', revision: 1, quantity: 1 }]]],
  ['a row it would leave invalid', [['Reserve', { id: 's1', revision: 1, quantity: 6 }]]],
  ['a set leaving a row invalid', [['Restock', { id: 's1', quantity: 4 }]]],
  ['an insert leaving a row invalid', [['List', { ...listed, reserved: 5 }]]],
  ['a row whose link breaks an invariant', [['Restock', { id: 's4', quantity: 12 }]]],
  ['an insert whose link breaks an invariant', [['List', { ...listed, ownerId: 'blocked' }]]],
  ['an id already taken', [['List', { ...listed, id: 's1' }]]],
  ['a delete at a stale revision', [['Withdraw', { id: 's2', revision: 7 }]]],
  ['a delete of a row not a draft', [['Withdraw', { id: 's1', revision: 1 }]]],
  [
    'a retry of an update that landed',
    [
      ['Relabel', { id: 's1', revision: 1, label: 'nut' }],
      ['Relabel', { id: 's1', revision: 1, label: 'nut' }],
    ],
  ],
  [
    'a retry of a computing update that landed',
    [
      ['Rename', { id: 's2', revision: 1, name: 'Nut', prefix: '' }],
      ['Rename', { id: 's2', revision: 1, name: 'Nut', prefix: '' }],
    ],
  ],
]

describe('the memory writer and the SQLite writer', () => {
  it.each(cases)('agree on %s', async (_, sends) => {
    const [memoryRun, sqliteRun] = await Promise.all([inMemory(sends), overSqlite(sends)])
    expect(memoryRun).toEqual(sqliteRun)
  })

  it('compare something: a refusal and a write each tell the two apart', async () => {
    const refused = await inMemory([['Reserve', { id: 's1', revision: 7, quantity: 1 }]])
    const landed = await inMemory([['Reserve', { id: 's1', revision: 1, quantity: 1 }]])
    expect(refused).not.toEqual(landed)
    expect(refused.outcomes[0]).toMatchObject({ failure: { refusal: { _tag: 'Conflict' } } })
  })
})
