// @vitest-environment node
/**
 * A guarded delete that clears links to its row (#467): the guard judges the
 * folder named, and hands its writer each doc's own rules for unlinking it,
 * its row's Update rule and its relation's Unlink rule, for the same person.
 * The writer judges them over every doc it would clear, in the statement that
 * deletes; one refused, and the whole delete is `Forbidden`, and nothing
 * changes. On SQLite and Postgres; D1 is the writer's own test.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Remote, RemoteClient } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { Surface } from 'foldkit-surface'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { postgres } from 'foldkit-remote-drizzle/pg'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

postgres()

const User = Schema.Struct({ id: Schema.String })
type User = typeof User.Type

const sqliteTables = {
  folders: sqliteTable('folders', {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
  }),
  docs: sqliteTable('docs', {
    id: text('id').primaryKey(),
    folderId: text('folder_id'),
    ownerId: text('owner_id').notNull(),
  }),
}
const pgTables = {
  folders: pgTable('folders', {
    id: pgText('id').primaryKey(),
    ownerId: pgText('owner_id').notNull(),
  }),
  docs: pgTable('docs', {
    id: pgText('id').primaryKey(),
    folderId: pgText('folder_id'),
    ownerId: pgText('owner_id').notNull(),
  }),
}
type Tables = typeof sqliteTables | typeof pgTables

/** Folders and their docs; a doc's owner alone may unlink it, by its row's rule or its link's. */
const domainOf = (by: 'row' | 'link') => {
  const FolderFields = Entity.define(
    'Folder',
    Schema.Struct({ id: Schema.String, ownerId: Schema.String }),
  )
  const Related = Entity.relate(
    {
      Folder: FolderFields,
      Doc: Entity.define('Doc', Schema.Struct({ id: Schema.String, ownerId: Schema.String })),
    },
    { Doc: { folder: Relation.one(FolderFields, { optional: true, onDelete: 'setNull' }) } },
  )
  const G = Guards.declare(
    'Files',
    User,
    guard => ({
      ownsFolder: guard.row(Related.Folder, p => Expr.eq(Related.Folder.fields.ownerId, p.id)),
      ownsDoc: guard.row(Related.Doc, p => Expr.eq(Related.Doc.fields.ownerId, p.id)),
    }),
    { key: user => user.id, unguarded: 'allow' },
  )
  const Folder = Related.Folder.pipe(Guards.attach(G, { row: { Delete: [G.ownsFolder] } }))
  const ownerOnly = Guards.on([G.ownsDoc], Guards.explain('Only its owner may move a doc.'))
  const Doc = Related.Doc.pipe(
    Guards.attach(
      G,
      by === 'row'
        ? { row: { Update: ownerOnly } }
        : { relations: { folder: { Unlink: ownerOnly } } },
    ),
    // `may` tells the page what each doc's rules allow, so it can refuse a delete where it is made.
    Guards.may,
  )
  const Policy = G.implement({})
  const bindOn = ({ folders, docs }: Tables) =>
    bind(
      { Folder, Doc },
      {
        Folder: { table: folders, visible: GuardDrizzle.visible(Policy, [Folder]).Folder },
        Doc: {
          table: docs,
          relations: { folder: { field: docs.folderId } },
          derived: { may: { supplied: true } },
        },
      },
    )
  const DeleteFolder = Mutation.write(
    'DeleteFolder',
    Write.delete(Entity.input(Folder, Schema.Struct({ id: Schema.String })), { id: 'id' }),
  )
  return { Folder, Doc, Policy, bindOn, DeleteFolder }
}
const ByRow = domainOf('row')
const ByLink = domainOf('link')

// Ada's f1 holds Bo's d2 beside her own d1; her f2 only her own d3.
const SCHEMA = [
  'create table folders (id text primary key, owner_id text not null)',
  'create table docs (id text primary key, folder_id text, owner_id text not null)',
  "insert into folders values ('f1', 'ada'), ('f2', 'ada')",
  "insert into docs values ('d1', 'f1', 'ada'), ('d2', 'f1', 'bo'), ('d3', 'f2', 'ada')",
]

interface Backend {
  readonly layer: Layer.Layer<DrizzleDatabase>
  readonly tables: Tables
  readonly rows: (statement: string) => Promise<ReadonlyArray<string>>
}

let pglite: PGlite
beforeAll(async () => {
  pglite = await PGlite.create()
})
afterAll(async () => {
  await pglite.close()
})

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
        tables: sqliteTables,
        rows: async statement => joined(sqlite.prepare(statement).all()),
      }
    },
  ],
  [
    'Postgres',
    async () => {
      await pglite.exec('drop table if exists folders, docs')
      for (const statement of SCHEMA) await pglite.exec(statement)
      return {
        layer: databaseLayer(drizzlePg({ client: pglite })),
        tables: pgTables,
        rows: async statement =>
          joined((await pglite.query<Record<string, unknown>>(statement)).rows),
      }
    },
  ],
]

const sent = (backend: Backend, domain: typeof ByRow, id: string) => {
  const Db = domain.bindOn(backend.tables)
  const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [
      RemoteServer.write(
        domain.DeleteFolder,
        GuardServer.writer(domain.Folder, domain.Policy, writer(Db.Folder), {
          children: [domain.Doc],
        }),
      ),
    ],
  })
  return Effect.runPromise(
    RemoteServer.handlers(server, Option.some({ id: 'ada' }))
      .FoldkitRemoteMutate({ requestId: `r-${id}`, mutation: 'DeleteFolder', input: { id } })
      .pipe(Effect.result, Effect.provide(backend.layer)),
  )
}

describe.each(backends)('A guarded delete that clears links, on %s', (_, open) => {
  const docs = (backend: Backend) => backend.rows('select id, folder_id from docs order by id')

  it.each([
    ['row', ByRow],
    ['link', ByLink],
  ] as const)(
    "is refused whole by the doc's %s rule when it would unlink another's doc",
    async (_, domain) => {
      const backend = await open()
      const answer = await sent(backend, domain, 'f1')
      expect(answer).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
      const message = answer._tag === 'Failure' ? String(answer.failure.message) : ''
      expect(message).toBe(
        'It would clear the link of a Doc you may not change: Only its owner may move a doc.',
      )
      expect(await backend.rows('select id from folders order by id')).toEqual(['f1', 'f2'])
      expect(await docs(backend)).toEqual(['d1:f1', 'd2:f1', 'd3:f2'])
    },
  )

  it('clears the links its asker may change, with the folder', async () => {
    const backend = await open()
    expect(await sent(backend, ByRow, 'f2')).toMatchObject({ _tag: 'Success' })
    expect(await backend.rows('select id from folders order by id')).toEqual(['f1'])
    expect(await docs(backend)).toEqual(['d1:f1', 'd2:f1', 'd3:null'])
  })
})

describe('A guarded writer that would clear links', () => {
  it('is refused without the guarded Entity of the rows it clears', () => {
    const Db = ByRow.bindOn(sqliteTables)
    expect(() => GuardServer.writer(ByRow.Folder, ByRow.Policy, writer(Db.Folder))).toThrow(
      /clears Doc\.folder under Doc's own Update rules; give Doc's guarded Entity as children/,
    )
  })

  it('is refused over a writer that does not clear', () => {
    const Db = ByRow.bindOn(sqliteTables)
    const { clears: _, ...unclearing } = writer(Db.Folder)
    expect(() =>
      GuardServer.writer(ByRow.Folder, ByRow.Policy, unclearing, { children: [ByRow.Doc] }),
    ).toThrow(/clears links of Doc rows under their own Update rules/)
  })
})

describe('The page over a guarded delete that clears links', () => {
  const Model = Schema.Struct({ remote: Remote.Model })
  const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
  const Data = Remote.make({
    model: App.model.remote,
    entities: [ByRow.Folder, ByRow.Doc],
    mutations: [ByRow.DeleteFolder],
  })
  const clientOn = () => {
    const sqlite = new DatabaseSync(':memory:')
    for (const statement of SCHEMA) sqlite.exec(statement)
    const Db = ByRow.bindOn(sqliteTables)
    const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
      // The filter supplies each row's `may`, which the page refuses a delete by.
      entities: [
        source(Db.Folder, { filter: GuardServer.filter(ByRow.Folder, ByRow.Policy) }),
        source(Db.Doc, { filter: GuardServer.filter(ByRow.Doc, ByRow.Policy) }),
      ],
      mutations: [
        RemoteServer.write(
          ByRow.DeleteFolder,
          GuardServer.writer(ByRow.Folder, ByRow.Policy, writer(Db.Folder), {
            children: [ByRow.Doc],
          }),
        ),
      ],
    })
    return Remote.clientLayer(RemoteServer.handlers(server, Option.some<User>({ id: 'ada' }))).pipe(
      Layer.provide(databaseLayer(drizzle({ client: sqlite }))),
    )
  }
  const lawOver = (id: string) =>
    Effect.runPromise(
      Law.check(Data, {
        model: { remote: Remote.initial },
        holds: [
          { entity: ByRow.Folder, ids: ['f1', 'f2'] },
          { entity: ByRow.Doc, ids: ['d1', 'd2', 'd3'] },
        ],
        mutation: ByRow.DeleteFolder,
        input: { id },
        now: 1,
      }).pipe(Effect.provide(clientOn())),
    )

  it("refuses, holding Bo's doc and what it allows, as the server refuses it", async () => {
    const report = await lawOver('f1')
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(['DeleteFolder'])
  })

  it('clears the docs Ada may change, and agrees on each', async () => {
    const report = await lawOver('f2')
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(expect.arrayContaining(['Folder:f2', 'Doc:d3']))
  })

  it("refuses where it is made, in the server's words", async () => {
    const held = Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: [
          { entity: 'Folder', id: 'f1', fields: ['id', 'ownerId'] },
          { entity: 'Doc', id: 'd2', fields: ['id', 'ownerId', 'folder', 'may'] },
        ],
        result: {
          settled: [],
          entities: [
            { entity: 'Folder', id: 'f1', values: { id: 'f1', ownerId: 'ada' } },
            {
              entity: 'Doc',
              id: 'd2',
              values: {
                id: 'd2',
                ownerId: 'bo',
                folder: 'Folder:f1',
                may: {
                  row: { Update: false },
                  reasons: { Update: 'Only its owner may move a doc.' },
                  members: {},
                  relations: {},
                },
              },
            },
          ],
        },
        now: 1,
      },
    )
    const started = Data.mutate(held, ByRow.DeleteFolder, { id: 'f1' })
    const unsent: RemoteClient['Service'] = {
      read: () => Effect.die('unsent'),
      query: () => Effect.die('unsent'),
      mutate: () => Effect.die('unsent'),
      live: () => Stream.die('unsent'),
    }
    const refusal = await Effect.runPromise(
      started.command.effect.pipe(Effect.provideService(RemoteClient, unsent)),
    )
    expect(Data.failedWrites(Data.reduce(started.model, refusal))).toMatchObject([
      {
        error: {
          message:
            'It would clear the link of a Doc you may not change: Only its owner may move a doc.',
        },
      },
    ])
  })
})
