/**
 * A link cleared by a delete (#467): `Relation.one(Folder, { optional: true,
 * onDelete: 'setNull' })` leaves each doc in a deleted folder pointing
 * nowhere, in the transaction (SQLite, Postgres) or the batch (D1) that
 * deletes it. No table here has a foreign key: the writer clears the links
 * itself. f1 holds Ada's d1, Bo's d2 and d3, whose owner is unknown; f2
 * holds Ada's d9; f3 holds Ada's d4 and d5, whose owner is unknown.
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { and, eq, isNotNull } from 'drizzle-orm'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Option, Schema } from 'effect'
import { Collation, Entity, Expr, Order, Query as Body, Relation, Write } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Query, Remote } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { Surface } from 'foldkit-surface'
import { RemoteServer, RowRequirement, type CascadeRequirement } from 'foldkit-remote-server'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, query, source, writer, type DrizzleDatabase } from '../src/index.js'

postgres()

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
const FolderFields = Entity.define('Folder', Schema.Struct({ id: Schema.String }))
const DocFields = Entity.define('Doc', Schema.Struct({ id: Schema.String }))
const Files = Entity.relate(
  { User: UserFields, Folder: FolderFields, Doc: DocFields },
  {
    Doc: {
      folder: Relation.one(FolderFields, { optional: true, onDelete: 'setNull' }),
      owner: Relation.one(UserFields, { optional: true }),
    },
  },
)
const { User, Folder, Doc } = Files

const sqliteTables = {
  users: sqliteTable('users', { id: text('id').primaryKey() }),
  folders: sqliteTable('folders', { id: text('id').primaryKey() }),
  docs: sqliteTable('docs', {
    id: text('id').primaryKey(),
    folderId: text('folder_id'),
    ownerId: text('owner_id'),
  }),
}
const pgTables = {
  users: pgTable('users', { id: pgText('id').primaryKey() }),
  folders: pgTable('folders', { id: pgText('id').primaryKey() }),
  docs: pgTable('docs', {
    id: pgText('id').primaryKey(),
    folderId: pgText('folder_id'),
    ownerId: pgText('owner_id'),
  }),
}
type Tables = typeof sqliteTables | typeof pgTables
const bindOn = ({ users, folders, docs }: Tables, ownDocs = false) =>
  bind({ User, Folder, Doc }, {
    User: { table: users },
    Folder: { table: folders },
    Doc: {
      table: docs,
      relations: { folder: { field: docs.folderId }, owner: { field: docs.ownerId } },
      // Where asked: each reader sees only their own filed docs. The rule reads
      // the link a delete clears, so a cleared doc is judged as it was (#518).
      ...(ownDocs
        ? {
            visible: (principal: unknown) =>
              and(isNotNull(docs.folderId), eq(docs.ownerId, String(principal))),
          }
        : {}),
    },
  } as const)

const SCHEMA = [
  'create table users (id text primary key)',
  'create table folders (id text primary key)',
  'create table docs (id text primary key, folder_id text, owner_id text)',
  "insert into users values ('ada'), ('bo')",
  "insert into folders values ('f1'), ('f2'), ('f3')",
  "insert into docs values ('d1', 'f1', 'ada'), ('d2', 'f1', 'bo'), ('d3', 'f1', null), ('d4', 'f3', 'ada'), ('d5', 'f3', null), ('d9', 'f2', 'ada')",
]

interface Backend {
  readonly layer: Layer.Layer<DrizzleDatabase>
  readonly rows: (statement: string) => Promise<ReadonlyArray<string>>
  readonly Db: ReturnType<typeof bindOn>
  readonly Own: ReturnType<typeof bindOn>
}

let pglite: PGlite
let mf: Miniflare
beforeAll(async () => {
  pglite = await PGlite.create()
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: ['DB'],
    host: '127.0.0.1',
    port: 0,
  })
}, 60_000)
afterAll(async () => {
  await pglite.close()
  await mf.dispose()
})

/** Each row of `select a, b …` as `a:b`. */
const joined = (rows: ReadonlyArray<Record<string, unknown>>) =>
  rows.map(row => Object.values(row).map(String).join(':'))

const backends: ReadonlyArray<readonly [string, () => Promise<Backend>]> = [
  [
    'SQLite',
    async () => {
      const sqlite = new DatabaseSync(':memory:')
      for (const statement of SCHEMA) sqlite.exec(statement)
      return {
        layer: databaseLayer(drizzle({ client: sqlite })),
        rows: async statement => joined(sqlite.prepare(statement).all()),
        Db: bindOn(sqliteTables),
        Own: bindOn(sqliteTables, true),
      }
    },
  ],
  [
    'Postgres',
    async () => {
      await pglite.exec('drop table if exists users, folders, docs')
      for (const statement of SCHEMA) await pglite.exec(statement)
      return {
        layer: databaseLayer(drizzlePg({ client: pglite })),
        rows: async statement =>
          joined((await pglite.query<Record<string, unknown>>(statement)).rows),
        Db: bindOn(pgTables),
        Own: bindOn(pgTables, true),
      }
    },
  ],
  [
    'D1',
    async () => {
      const db = await mf.getD1Database('DB')
      await db.batch(
        ['drop table if exists users', 'drop table if exists folders', 'drop table if exists docs']
          .concat(SCHEMA)
          .map(statement => db.prepare(statement)),
      )
      return {
        layer: databaseLayer(drizzleD1(db)),
        rows: async statement =>
          joined((await db.prepare(statement).all<Record<string, unknown>>()).results),
        Db: bindOn(sqliteTables),
        Own: bindOn(sqliteTables, true),
      }
    },
  ],
]

/** A Doc's Update rule as a guard hands it to the writer: only its owner's. */
const ownerOnly = (viewer: string, reason?: string): CascadeRequirement => ({
  entity: 'Doc',
  requires: {
    holds: RowRequirement.Body({
      query: Body.from(Doc).pipe(Body.where(Expr.eq(Doc.relations.owner, Expr.viewer(UserFields)))),
      input: {},
      context: { viewer: Option.some({ entity: 'User', id: viewer }), now: Option.none() },
    }),
    reason: Option.fromUndefinedOr(reason),
  },
})

describe.each(backends)('A cleared link, on %s', (_, open) => {
  const deleting = (
    backend: Backend,
    id: string,
    options: {
      readonly clearing?: ReadonlyArray<CascadeRequirement>
      readonly principal?: string
      readonly Db?: Backend['Db']
    } = {},
  ) =>
    Effect.runPromise(
      writer((options.Db ?? backend.Db).Folder)
        .delete({
          id,
          expect: Option.none(),
          when: Option.none(),
          ...(options.clearing === undefined ? {} : { clearing: options.clearing }),
          principal: options.principal ?? 'ada',
        })
        .pipe(Effect.result, Effect.provide(backend.layer)),
    )
  const docs = (backend: Backend) => backend.rows('select id, folder_id from docs order by id')
  const unchanged = async (backend: Backend) => {
    expect(await backend.rows('select id from folders order by id')).toEqual(['f1', 'f2', 'f3'])
    expect(await docs(backend)).toEqual(['d1:f1', 'd2:f1', 'd3:f1', 'd4:f3', 'd5:f3', 'd9:f2'])
  }

  it('leaves every doc in the folder pointing nowhere, and names each', async () => {
    const backend = await open()
    const answer = await deleting(backend, 'f1')
    expect(answer).toMatchObject({ _tag: 'Success', success: { _tag: 'Deleted', cascaded: [] } })
    const cleared =
      answer._tag === 'Success' && answer.success._tag === 'Deleted' ? answer.success.cleared : []
    expect(cleared.map(({ entity, id }) => `${entity}:${id}`).sort()).toEqual([
      'Doc:d1',
      'Doc:d2',
      'Doc:d3',
    ])
    expect(await backend.rows('select id from folders order by id')).toEqual(['f2', 'f3'])
    expect(await docs(backend)).toEqual([
      'd1:null',
      'd2:null',
      'd3:null',
      'd4:f3',
      'd5:f3',
      'd9:f2',
    ])
  })

  it('names only the docs its asker saw before the clear, and clears the rest unnamed', async () => {
    const backend = await open()
    const answer = await deleting(backend, 'f1', { Db: backend.Own })
    const cleared =
      answer._tag === 'Success' && answer.success._tag === 'Deleted' ? answer.success.cleared : []
    expect(cleared).toEqual([{ entity: 'Doc', id: 'd1' }])
    expect(await docs(backend)).toEqual([
      'd1:null',
      'd2:null',
      'd3:null',
      'd4:f3',
      'd5:f3',
      'd9:f2',
    ])
  })

  it('is refused whole when a doc it would clear is not its asker to change', async () => {
    const backend = await open()
    const answer = await deleting(backend, 'f1', {
      clearing: [ownerOnly('ada', 'Only its owner may move a doc.')],
    })
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    const message = answer._tag === 'Failure' ? String(answer.failure.message) : ''
    expect(message).toBe(
      'It would clear the link of a Doc you may not change: Only its owner may move a doc.',
    )
    expect(message).not.toMatch(/d2|d3|bo/)
    await unchanged(backend)
  })

  it('counts a rule unknown for a doc as refused', async () => {
    const backend = await open()
    // f3's d4 is Ada's; its d5 has no owner, so whether it is Ada's is unknown.
    const answer = await deleting(backend, 'f3', { clearing: [ownerOnly('ada')] })
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    await unchanged(backend)
  })

  it('clears what every rule allows', async () => {
    const backend = await open()
    expect(await deleting(backend, 'f2', { clearing: [ownerOnly('ada')] })).toMatchObject({
      _tag: 'Success',
    })
    expect(await backend.rows('select id from folders order by id')).toEqual(['f1', 'f3'])
    expect(await docs(backend)).toEqual(['d1:f1', 'd2:f1', 'd3:f1', 'd4:f3', 'd5:f3', 'd9:null'])
  })

  it('refuses a requirement for an Entity it clears nothing of', async () => {
    const backend = await open()
    const answer = await deleting(backend, 'f1', {
      clearing: [{ ...ownerOnly('ada'), entity: 'User' }],
    })
    expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'RemoteServerError' } })
    await unchanged(backend)
  })
})

describe('A cleared link where the writer is made', () => {
  const DeleteFolder = Mutation.write(
    'DeleteFolder',
    Write.delete(Entity.input(Folder, Schema.Struct({ id: Schema.String })), { id: 'id' }),
  )

  it('refuses a delete through a writer that does not clear', () => {
    const { clears: _, ...unclearing } = writer(bindOn(sqliteTables).Folder)
    expect(() => RemoteServer.write(DeleteFolder, unclearing)).toThrow(
      /Doc\.folder point at \(onDelete: 'setNull'\), but its writer does not clear them \(clears\)/,
    )
  })

  // #519: a table that clears the link itself, where the domain does not, goes unforeseen.
  const linkedBy = (onDelete: 'set null' | 'set default', declared: boolean) => {
    const Shelf = Entity.define('Shelf', Schema.Struct({ id: Schema.String }))
    const Box = Entity.define('Box', Schema.Struct({ id: Schema.String }))
    const Store = Entity.relate(
      { Shelf, Box },
      {
        Box: {
          shelf: declared
            ? Relation.one(Shelf, { optional: true, onDelete: 'setNull' })
            : Relation.one(Shelf, { optional: true }),
        },
      },
    )
    const shelves = sqliteTable('shelves', { id: text('id').primaryKey() })
    const boxes = sqliteTable('boxes', {
      id: text('id').primaryKey(),
      shelf: text('shelf').references(() => shelves.id, { onDelete }),
    })
    return () =>
      bind(Store, {
        Shelf: { table: shelves },
        Box: { table: boxes, relations: { shelf: { field: boxes.shelf } } },
      })
  }

  it.each(['set null', 'set default'] as const)(
    'refuses a foreign key that would %s a link the domain does not clear',
    action => {
      expect(linkedBy(action, false)).toThrow(
        `relation "shelf" on entity "Box" is stored on "shelf", whose foreign key says on delete ${action}; declare it Relation.one(Shelf, { optional: true, onDelete: 'setNull' }), so a client foresees it and the writer reports it`,
      )
    },
  )

  it('binds a foreign key that sets null where the domain clears the link', () => {
    expect(linkedBy('set null', true)).not.toThrow()
  })

  it('refuses a cascade into an Entity whose links something clears', () => {
    const Shelf = Entity.define('Shelf', Schema.Struct({ id: Schema.String }))
    const Box = Entity.define('Box', Schema.Struct({ id: Schema.String }))
    const Tag = Entity.define('Tag', Schema.Struct({ id: Schema.String }))
    const Store = Entity.relate(
      { Shelf, Box, Tag },
      {
        Box: { shelf: Relation.one(Shelf, { onDelete: 'cascade' }) },
        Tag: { box: Relation.one(Box, { optional: true, onDelete: 'setNull' }) },
      },
    )
    const shelves = sqliteTable('shelves', { id: text('id').primaryKey() })
    const boxes = sqliteTable('boxes', {
      id: text('id').primaryKey(),
      shelf: text('shelf').notNull(),
    })
    const tags = sqliteTable('tags', { id: text('id').primaryKey(), box: text('box') })
    const Db = bind(Store, {
      Shelf: { table: shelves },
      Box: { table: boxes, relations: { shelf: { field: boxes.shelf } } },
      Tag: { table: tags, relations: { box: { field: tags.box } } },
    })
    const DeleteShelf = Mutation.write(
      'DeleteShelf',
      Write.delete(Entity.input(Store.Shelf, Schema.Struct({ id: Schema.String })), { id: 'id' }),
    )
    expect(() => RemoteServer.write(DeleteShelf, writer(Db.Shelf))).toThrow(
      /cascade takes Box rows, whose links Tag\.box clear/,
    )
  })
})

describe('The law over a delete that clears links', () => {
  const DeleteFolder = Mutation.write(
    'DeleteFolder',
    Write.delete(Entity.input(Folder, Schema.Struct({ id: Schema.String })), { id: 'id' }),
  )
  // The docs in f1: a cleared doc leaves it while the delete is pending.
  const InFolder = Query.define('InFolder', {}, () =>
    Query.from(Doc).pipe(
      Query.where(Expr.eq(Doc.relations.folder, 'f1')),
      Query.orderBy(Order.asc(Doc.fields.id, { collation: Collation.binary })),
    ),
  )
  const Model = Schema.Struct({ remote: Remote.Model })
  const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
  const Data = Remote.make({
    model: App.model.remote,
    entities: [User, Folder, Doc],
    queries: [InFolder],
    mutations: [DeleteFolder],
  })

  it('agrees on every doc and the list while pending, and once answered', async () => {
    const sqlite = new DatabaseSync(':memory:')
    for (const statement of SCHEMA) sqlite.exec(statement)
    const Db = bindOn(sqliteTables)
    const server = RemoteServer.make<string, DrizzleDatabase>({
      entities: [source(Db.User), source(Db.Folder), source(Db.Doc)],
      queries: [query(InFolder, { entity: Db.Doc })],
      mutations: [RemoteServer.write(DeleteFolder, writer(Db.Folder))],
    })
    const report = await Effect.runPromise(
      Law.check(Data, {
        model: { remote: Remote.initial },
        holds: [
          { entity: Folder, ids: ['f1', 'f2', 'f3'] },
          { entity: Doc, ids: ['d1', 'd2', 'd3', 'd9'] },
        ],
        lists: [InFolder.ref({})],
        mutation: DeleteFolder,
        input: { id: 'f1' },
        now: 1,
      }).pipe(
        Effect.provide(
          Remote.clientLayer(RemoteServer.handlers(server, 'ada')).pipe(
            Layer.provide(databaseLayer(drizzle({ client: sqlite }))),
          ),
        ),
      ),
    )
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(
      expect.arrayContaining(['Doc:d1', 'Doc:d2', 'Doc:d3', InFolder.ref({}).identity]),
    )
  })
})
