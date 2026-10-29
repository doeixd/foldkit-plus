// @vitest-environment node
/**
 * Write rules over paths, judged in the write's statement
 * (operations-phase7-DESIGN §12): a row's Update and Delete rule may read
 * another row, and the drizzle writer holds the row to it in the UPDATE or
 * DELETE that writes it, so the rule reads that other row as the statement
 * runs. A write that would change what such a rule reads of its own row is
 * refused; `may` leaves such an interaction unanswered. On SQLite and Postgres.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Option, Result, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const Fields = {
  Team: Entity.define('Team', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
  Member: Entity.define('Member', Schema.Struct({ id: Schema.String })),
  Note: Entity.define(
    'Note',
    Schema.Struct({ id: Schema.String, orgId: Schema.String, title: Schema.String }),
  ),
}
const Related = Entity.relate(Fields, {
  Member: { team: Relation.one(Fields.Team, { optional: true }) },
  Note: { author: Relation.one(Fields.Member) },
})
const orgOfViewer = Expr.path(
  Expr.viewer(Related.Member),
  Expr.path(Related.Member.relations.team, Related.Team.fields.orgId),
)
const G = Guards.declare(
  'Notes',
  Schema.Struct({ id: Schema.String }),
  guard => ({
    isAuthor: guard.row(Related.Note, () =>
      Expr.eq(Related.Note.relations.author, Expr.viewer(Related.Member)),
    ),
    inOrg: guard.row(Related.Note, () => Expr.eq(Related.Note.fields.orgId, orgOfViewer)),
  }),
  { key: user => user.id, unguarded: 'allow', viewer: Related.Member },
)
// Its author reads it; only someone in its organisation, as their team says now, changes it.
const Note = Related.Note.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isAuthor, G.inOrg],
      Update: Guards.on([G.inOrg], Guards.explain('Only its organisation may change it.')),
      Delete: [G.inOrg],
    },
  }),
  Guards.may,
)
const Policy = G.implement({})

const Retitle = Mutation.write(
  'Retitle',
  Write.update(Entity.input(Note, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
const Move = Mutation.write(
  'Move',
  Write.update(Entity.input(Note, Schema.Struct({ id: Schema.String, orgId: Schema.String })), {
    id: 'id',
  }),
)
const Drop = Mutation.write(
  'Drop',
  Write.delete(Entity.input(Note, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const create = [
  'create table teams (id text primary key, org_id text not null)',
  'create table members (id text primary key, team_id text)',
  'create table notes (id text primary key, org_id text not null, title text not null, author_id text not null)',
  "insert into teams values ('t1', 'acme'), ('t2', 'globex')",
  "insert into members values ('ada', 't1'), ('bo', null)",
  "insert into notes values ('n1', 'acme', 'Plans', 'ada'), ('n2', 'globex', 'Notes', 'bo')",
]

const sqliteTables = (() => {
  const teams = sqliteTable('teams', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
  })
  const members = sqliteTable('members', { id: text('id').primaryKey(), teamId: text('team_id') })
  const notes = sqliteTable('notes', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    title: text('title').notNull(),
    authorId: text('author_id').notNull(),
  })
  return bind(
    { Team: Related.Team, Member: Related.Member, Note },
    {
      Team: { table: teams },
      Member: { table: members, relations: { team: { field: members.teamId } } },
      Note: {
        table: notes,
        visible: GuardDrizzle.visible(Policy, [Note]).Note,
        relations: { author: { field: notes.authorId } },
        derived: { may: { supplied: true } },
      },
    },
  )
})()

const pgTables = (() => {
  const teams = pgTable('teams', {
    id: pgText('id').primaryKey(),
    orgId: pgText('org_id').notNull(),
  })
  const members = pgTable('members', { id: pgText('id').primaryKey(), teamId: pgText('team_id') })
  const notes = pgTable('notes', {
    id: pgText('id').primaryKey(),
    orgId: pgText('org_id').notNull(),
    title: pgText('title').notNull(),
    authorId: pgText('author_id').notNull(),
  })
  return bind(
    { Team: Related.Team, Member: Related.Member, Note },
    {
      Team: { table: teams },
      Member: { table: members, relations: { team: { field: members.teamId } } },
      Note: {
        table: notes,
        visible: GuardDrizzle.visible(Policy, [Note]).Note,
        relations: { author: { field: notes.authorId } },
        derived: { may: { supplied: true } },
      },
    },
  )
})()

const serverFor = (Db: typeof sqliteTables | typeof pgTables) => {
  const guarded = GuardServer.writer(Note, Policy, writer(Db.Note))
  return RemoteServer.make<Option.Option<{ readonly id: string }>, DrizzleDatabase>({
    entities: [source(Db.Note, { filter: GuardServer.filter(Note, Policy) })],
    mutations: [
      RemoteServer.write(Retitle, guarded),
      RemoteServer.write(Move, guarded),
      RemoteServer.write(Drop, guarded),
    ],
    viewer: Policy.viewer,
  })
}

const as = (id: string) => Option.some({ id })

const dialects = [
  {
    name: 'SQLite',
    Db: sqliteTables,
    open: async () => {
      const client = new DatabaseSync(':memory:')
      for (const statement of create) client.exec(statement)
      return {
        layer: databaseLayer(drizzle({ client })),
        run: (statement: string) => void client.exec(statement),
        close: async () => client.close(),
      }
    },
  },
  {
    name: 'Postgres',
    Db: pgTables,
    open: async () => {
      const client = new PGlite()
      const db = drizzlePg({ client })
      for (const statement of create) await db.execute(sql.raw(statement))
      return {
        layer: databaseLayer(db),
        run: (statement: string) => db.execute(sql.raw(statement)).then(() => undefined),
        close: () => client.close(),
      }
    },
  },
]

describe.each(dialects)('a write rule over a path, on $name', ({ Db, open }) => {
  const server = serverFor(Db)
  let database: Awaited<ReturnType<typeof open>>
  beforeAll(async () => {
    database = await open()
  }, 60_000)
  afterAll(() => database.close())

  const mutate = (
    principal: Option.Option<{ readonly id: string }>,
    mutation: string,
    input: unknown,
  ) =>
    Effect.runPromise(
      Effect.result(
        RemoteServer.handlers(server, principal).FoldkitRemoteMutate({
          requestId: 'r',
          mutation,
          input,
        }),
      ).pipe(Effect.provide(database.layer as Layer.Layer<DrizzleDatabase>)),
    )
  const failure = (result: Result.Result<unknown, { readonly _tag: string }>) =>
    Result.match(result, { onSuccess: () => 'applied', onFailure: error => error })

  it('lets someone of the organisation change it, and refuses one who only reads it', async () => {
    expect(failure(await mutate(as('ada'), 'Retitle', { id: 'n1', title: 'Plans, kept' }))).toBe(
      'applied',
    )
    // bo wrote n2 and reads it, but is on no team.
    expect(failure(await mutate(as('bo'), 'Retitle', { id: 'n2', title: 'Mine' }))).toMatchObject({
      _tag: 'Forbidden',
      reason: 'Only its organisation may change it.',
    })
    expect(failure(await mutate(as('bo'), 'Drop', { id: 'n2' }))).toMatchObject({
      _tag: 'Forbidden',
    })
  })

  it('reads the other row as the statement runs: a change of team is in force at once', async () => {
    await database.run("update members set team_id = 't2' where id = 'ada'")
    expect(failure(await mutate(as('ada'), 'Retitle', { id: 'n1', title: 'Gone' }))).toMatchObject({
      _tag: 'Forbidden',
    })
    expect(failure(await mutate(as('ada'), 'Retitle', { id: 'n2', title: 'Now ours' }))).toBe(
      'applied',
    )
    await database.run("update members set team_id = 't1' where id = 'ada'")
  })

  it('refuses a write that changes what the rule reads of its own row', async () => {
    expect(failure(await mutate(as('ada'), 'Move', { id: 'n1', orgId: 'globex' }))).toMatchObject({
      _tag: 'Forbidden',
    })
  })

  it('does not answer may for an interaction one row cannot decide', async () => {
    const read = await Effect.runPromise(
      RemoteServer.handlers(server, as('ada'))
        .FoldkitRemoteRead({
          version: REMOTE_PROTOCOL_VERSION,
          requests: [{ entity: 'Note', id: 'n1', fields: ['may'] }],
        })
        .pipe(Effect.provide(database.layer as Layer.Layer<DrizzleDatabase>)),
    )
    expect(read.entities[0]?.values.may).toEqual(expect.objectContaining({ row: {} }))
  })

  it('deletes for someone of the organisation', async () => {
    expect(failure(await mutate(as('ada'), 'Drop', { id: 'n1' }))).toBe('applied')
  })
})

describe('a write rule over a path, over a writer that cannot judge it', () => {
  it('is refused when the guarded writer is made', () => {
    const { requires: _, ...blind } = writer(sqliteTables.Note)
    expect(() => GuardServer.writer(Note, Policy, blind)).toThrow(
      'inOrg reads another row, which only a writer judging rules in its statement can hold it to',
    )
  })
})
