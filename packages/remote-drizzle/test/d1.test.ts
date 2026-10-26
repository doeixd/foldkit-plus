// @vitest-environment node
/**
 * `foldkit-remote-drizzle` over Cloudflare D1, through `drizzle-orm/d1` and a
 * miniflare binding: the same normalized wire values as over in-process
 * SQLite, including the window-function pagination, row-value cursors, and
 * `LIKE ... ESCAPE` search D1 must accept. Miniflare's binding rejects what
 * production D1 rejects, so unsupported SQL fails loudly here.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Expr, Order, Write } from 'foldkit-entity'
import { Mutation, Query } from 'foldkit-remote'
import { RemoteServer, type MutationSource } from 'foldkit-remote-server'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  bind,
  databaseLayer,
  type DrizzleDatabase,
  drizzleWrites,
  entity,
  many,
  one,
  query,
  returning,
  source,
  type AnyEntityBinding,
  writer,
} from '../src/index.js'

const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id'),
  createdAt: text('created_at').notNull(),
})

const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  projectId: text('project_id').notNull(),
  createdAt: text('created_at').notNull(),
})

const UserBinding = entity('User', users)
const CommentBinding = entity('Comment', comments)
const ProjectBinding = entity('Project', projects, {
  relations: {
    owner: one(UserBinding, { field: projects.ownerId, nullable: true }),
    comments: many(CommentBinding, {
      foreignKey: comments.projectId,
      localKey: projects.id,
      orderBy: [{ key: comments.createdAt, direction: 'asc' }],
    }),
  },
  computed: { commentCount: { relation: 'comments' } },
})

const Projects = Query.make('Projects', {
  Input: Schema.Struct({}),
  Result: Query.connection({ name: 'Project' }),
})

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Blog = Entity.relate({ Post }, { Post: {} })
const Db = bind(Blog, { Post: { table: projects, fields: { title: projects.name } } })
const PostsByTitle = Query.define('PostsByTitle', { q: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.contains(Post.fields.title, input.q)),
    Query.orderBy(Order.asc(Post.fields.id)),
  ),
)

type D1 = Awaited<ReturnType<Miniflare['getD1Database']>>

let mf: Miniflare
let db: D1

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
  })
  db = await mf.getD1Database('DB')
}, 60_000)

afterAll(async () => {
  await mf.dispose()
})

beforeEach(async () => {
  await db.batch([
    db.prepare('DROP TABLE IF EXISTS users'),
    db.prepare('DROP TABLE IF EXISTS projects'),
    db.prepare('DROP TABLE IF EXISTS comments'),
    db.prepare('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL)'),
    db.prepare(
      'CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT, created_at TEXT NOT NULL)',
    ),
    db.prepare(
      'CREATE TABLE comments (id TEXT PRIMARY KEY, body TEXT NOT NULL, project_id TEXT NOT NULL, created_at TEXT NOT NULL)',
    ),
    db.prepare("INSERT INTO users (id, name) VALUES ('u1', 'Ada'), ('u2', 'Grace')"),
    db.prepare(
      "INSERT INTO projects (id, name, owner_id, created_at) VALUES ('p1', 'Alpha', 'u1', '2020-01-01'), ('p2', 'Beta', 'u1', '2020-01-02'), ('p3', 'Gamma', NULL, '2020-01-03')",
    ),
    db.prepare(
      "INSERT INTO comments (id, body, project_id, created_at) VALUES ('c1', 'a', 'p1', '2020-01-01'), ('c2', 'b', 'p1', '2020-01-02'), ('c3', 'c', 'p2', '2020-01-01')",
    ),
  ])
})

const database = () => drizzle(db)

const read = (
  binding: AnyEntityBinding,
  context: Parameters<ReturnType<typeof source>['read']>[0],
) =>
  Effect.runPromise(
    source(binding)
      .read(context)
      .pipe(Effect.provide(databaseLayer(database()))),
  )

describe('RemoteDrizzle over D1', () => {
  it('reads refs, a child list, and a computed count from real D1 SQL', async () => {
    const records = await read(ProjectBinding, {
      ids: ['p1'],
      fields: ['id', 'name', 'owner', 'comments', 'commentCount'],
      principal: null,
    })
    expect(records).toEqual([
      {
        id: 'p1',
        values: {
          id: 'p1',
          name: 'Alpha',
          owner: 'User:u1',
          comments: ['Comment:c1', 'Comment:c2'],
          commentCount: 2,
        },
      },
    ])
  }, 30_000)

  it('pages a windowed relation with a first window and an after cursor', async () => {
    const first = await read(ProjectBinding, {
      ids: ['p1'],
      fields: ['id', 'comments'],
      principal: null,
      windows: { comments: { first: 1 } },
    })
    expect(first[0]!.values.comments).toEqual({
      refs: ['Comment:c1'],
      hasNext: true,
      hasPrevious: false,
    })
    const second = await read(ProjectBinding, {
      ids: ['p1'],
      fields: ['id', 'comments'],
      principal: null,
      windows: { comments: { first: 1, after: 'Comment:c1' } },
    })
    expect(second[0]!.values.comments).toEqual({
      refs: ['Comment:c2'],
      hasNext: false,
      hasPrevious: true,
    })
  }, 30_000)

  it('pages a keyset query forward and backward over D1 rows', async () => {
    const byCreated = query(Projects, {
      entity: ProjectBinding,
      orderBy: [{ key: projects.createdAt, direction: 'asc' }],
    })
    const run = (window: Parameters<typeof byCreated.run>[0]['window']) =>
      Effect.runPromise(
        byCreated
          .run({ input: {}, window, principal: null })
          .pipe(Effect.provide(databaseLayer(database()))),
      )
    expect((await run({ first: 2 })).edges.map(edge => edge.id)).toEqual(['p1', 'p2'])
    expect((await run({ first: 2, after: 'p2' })).edges.map(edge => edge.id)).toEqual(['p3'])
    expect((await run({ last: 2 })).edges.map(edge => edge.id)).toEqual(['p2', 'p3'])
  }, 30_000)

  it('searches text through the compiled contains over D1', async () => {
    const byTitle = query(PostsByTitle, { entity: Db.Post })
    const ids = await Effect.runPromise(
      byTitle
        .run({ input: { q: 'alp' }, window: { first: 10 }, principal: null })
        .pipe(Effect.provide(databaseLayer(database()))),
    ).then(page => page.edges.map(edge => edge.id))
    expect(ids).toEqual(['p1'])
    const upper = await Effect.runPromise(
      byTitle
        .run({ input: { q: 'ALP' }, window: { first: 10 }, principal: null })
        .pipe(Effect.provide(databaseLayer(database()))),
    ).then(page => page.edges.map(edge => edge.id))
    expect(upper).toEqual(['p1'])
  }, 30_000)

  it('writes through the typed writes, and returns every column of the row it wrote', async () => {
    const patches = await Effect.runPromise(
      Effect.gen(function* () {
        const writes = yield* drizzleWrites
        yield* Effect.promise(() =>
          Promise.resolve(
            writes
              .insert(projects)
              .values({ id: 'p9', name: 'Nine', ownerId: 'u1', createdAt: '2020-02-02' }),
          ),
        )
        yield* Effect.promise(() =>
          Promise.resolve(
            writes.update(projects).set({ name: 'Renamed' }).where(eq(projects.id, 'p9')),
          ),
        )
        return yield* returning.row(ProjectBinding, 'p9')
      }).pipe(Effect.provide(databaseLayer(database()))),
    )
    expect(patches).toEqual([
      {
        entity: 'Project',
        id: 'p9',
        values: {
          id: 'p9',
          name: 'Renamed',
          ownerId: 'u1',
          createdAt: '2020-02-02',
          owner: 'User:u1',
        },
      },
    ])
  }, 30_000)
})

describe('A declared write over D1', () => {
  const Item = Entity.define(
    'Item',
    Schema.Struct({ id: Schema.String, stock: Schema.Int, revision: Schema.Number }),
  )
  const items = sqliteTable('items', {
    id: text('id').primaryKey(),
    stock: integer('stock').notNull(),
    revision: integer('revision').notNull(),
  })
  const ItemDb = bind({ Item }, { Item: { table: items } })
  const ledgerTable = sqliteTable('write_ledger', {
    scope: text('scope').notNull(),
    operation: text('operation').notNull(),
    target: text('target').notNull(),
    answer: text('answer').notNull(),
    at: integer('at').notNull(),
  })
  const Amount = Entity.input(
    Item,
    Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Int }),
    { quantity: Entity.unmapped },
  )
  // Takes from the stock only while some is left: the precondition reads the row the sum moves.
  const Sell = Mutation.write(
    'Sell',
    Write.update(Amount, {
      id: 'id',
      expect: 'revision',
      increment: { stock: 'quantity' },
      when: () => Expr.gte(Item.fields.stock, 1),
    }),
  )
  const Take = Mutation.write(
    'Take',
    Write.update(
      Entity.input(Item, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
        quantity: Entity.unmapped,
      }),
      { id: 'id', increment: { stock: 'quantity' } },
    ),
  )
  let requests = 0
  const send = (
    mutations: ReadonlyArray<MutationSource<string, DrizzleDatabase>>,
    mutation: string,
    input: unknown,
    operation?: string,
  ) =>
    Effect.runPromise(
      RemoteServer.handlers(RemoteServer.make({ entities: [], mutations }), 'ada')
        .FoldkitRemoteMutate({
          requestId: `r${++requests}`,
          mutation,
          input,
          ...(operation === undefined ? {} : { operation }),
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(database()))),
    )
  const stock = async () =>
    (await db.prepare("SELECT stock, revision FROM items WHERE id = 'i1'").first()) as unknown

  beforeEach(async () => {
    await db.batch([
      db.prepare('DROP TABLE IF EXISTS items'),
      db.prepare('DROP TABLE IF EXISTS write_ledger'),
      db.prepare(
        'CREATE TABLE items (id TEXT PRIMARY KEY, stock INTEGER NOT NULL, revision INTEGER NOT NULL)',
      ),
      db.prepare(
        'CREATE TABLE write_ledger (scope TEXT NOT NULL, operation TEXT NOT NULL, target TEXT NOT NULL, answer TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (scope, operation, target))',
      ),
      db.prepare("INSERT INTO items VALUES ('i1', 1, 1)"),
    ])
  })

  it('adds the amount and checks its precondition in the one statement D1 runs', async () => {
    const sell = [RemoteServer.write(Sell, writer<string>(ItemDb.Item))]
    expect(await send(sell, 'Sell', { id: 'i1', revision: 1, quantity: -1 })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 'i1', values: { stock: 0, revision: 2 } }] },
    })
    // None left: refused as unmet, at the revision it now has, and nothing moves.
    expect(await send(sell, 'Sell', { id: 'i1', revision: 2, quantity: -1 })).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Unmet' } },
    })
    expect(await stock()).toEqual({ stock: 0, revision: 2 })
  }, 30_000)

  it('refuses an update that would leave the row breaking an invariant, in the one statement', async () => {
    const Guarded = Entity.define(
      'Item',
      Schema.Struct({ id: Schema.String, stock: Schema.Int, revision: Schema.Number }),
    ).pipe(
      Entity.invariant('stockNotNegative', ({ after }) => Expr.gte(after.stock, 0), {
        message: 'Stock cannot go below zero',
      }),
    )
    const GuardedDb = bind({ Item: Guarded }, { Item: { table: items } })
    const Restock = Mutation.write(
      'Restock',
      Write.update(
        Entity.input(
          Guarded,
          Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Int }),
          { quantity: Entity.unmapped },
        ),
        { id: 'id', expect: 'revision', increment: { stock: 'quantity' } },
      ),
    )
    const restock = [RemoteServer.write(Restock, writer<string>(GuardedDb.Item))]
    expect(await send(restock, 'Restock', { id: 'i1', revision: 1, quantity: -2 })).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Invalid', rule: 'stockNotNegative', path: ['stock'] } },
    })
    expect(await stock()).toEqual({ stock: 1, revision: 1 })
    expect(await send(restock, 'Restock', { id: 'i1', revision: 1, quantity: -1 })).toMatchObject({
      _tag: 'Success',
    })
  }, 30_000)

  it('refuses a ledger, which needs a transaction D1 does not offer, and writes nothing', async () => {
    const take = [
      RemoteServer.write(
        Take,
        writer<string>(ItemDb.Item, {
          ledger: { table: ledgerTable, scope: principal => principal },
        }),
      ),
    ]
    expect(await send(take, 'Take', { id: 'i1', quantity: 5 }, 'op-a')).toMatchObject({
      _tag: 'Failure',
      failure: { message: "Item's ledger needs a database with transactions" },
    })
    expect(await stock()).toEqual({ stock: 1, revision: 1 })
    expect(await db.prepare('SELECT * FROM write_ledger').all()).toMatchObject({ results: [] })
  }, 30_000)
})
