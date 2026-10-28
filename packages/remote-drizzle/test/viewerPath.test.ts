/**
 * A note set to the organisation of whoever writes it: `orgId` is a path from
 * the viewer through their team (`Entity.sets`), which the server reads
 * through its own sources as the asker may see them, over SQLite. A path that
 * reaches no row (no team, a team hidden from the asker) is refused, and a
 * server that cannot read a row the path reaches is refused where it is made.
 * operations-phase3-DESIGN.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation, Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from '../src/index.js'

const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  teamId: text('team_id'),
})
const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  // Whether every asker may see the team; a closed one is hidden from all.
  open: text('open').notNull(),
})
const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  orgId: text('org_id').notNull(),
})

const Fields = {
  Team: Entity.define('Team', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
  Member: Entity.define('Member', Schema.Struct({ id: Schema.String })),
  Note: Entity.define(
    'Note',
    Schema.Struct({ id: Schema.String, body: Schema.String, orgId: Schema.String }),
  ),
}
const {
  Team,
  Member,
  Note: Unset,
} = Entity.relate(Fields, {
  Member: { team: Relation.one(Fields.Team, { optional: true }) },
})
// A note belongs to the organisation of whoever writes it: no input names it.
const Note = Unset.pipe(
  Entity.sets(
    { orgId: Expr.path(Expr.viewer(Member), Expr.path(Member.relations.team, Team.fields.orgId)) },
    { on: 'create' },
  ),
)

const Db = bind(
  { Team, Member, Note },
  {
    Team: { table: teams, visible: () => eq(teams.open, 'yes') },
    Member: { table: members, relations: { team: { field: members.teamId, optional: true } } },
    Note: { table: notes },
  },
)
const AddNote = Mutation.write(
  'AddNote',
  Write.insert(Entity.input(Note, Schema.Struct({ id: Schema.String, body: Schema.String })), {
    id: 'id',
  }),
)
const viewer = (principal: string) => Option.some(Remote.ref(Member, principal))

const serve = (entities = [source(Db.Member), source(Db.Team)]) =>
  RemoteServer.make<string, DrizzleDatabase>({
    entities,
    mutations: [RemoteServer.write(AddNote, writer(Db.Note))],
    viewer,
  })

const sandbox = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table members (id text primary key, team_id text);
    create table teams (id text primary key, org_id text not null, open text not null);
    create table notes (id text primary key, body text not null, org_id text not null);
    insert into teams values ('t1', 'acme', 'yes'), ('t2', 'globex', 'no');
    insert into members values ('ada', 't1'), ('bo', null), ('cy', 't2');
  `)
  const server = serve()
  const add = (who: string, id: string) =>
    Effect.runPromise(
      RemoteServer.handlers(server, who)
        .FoldkitRemoteMutate({ requestId: id, mutation: 'AddNote', input: { id, body: 'Hi' } })
        .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite }))), Effect.result),
    )
  return { add, notes: () => sqlite.prepare('select id, org_id from notes').all() }
}

describe('a member set from a path through the viewer, on the server', () => {
  it("writes what the asker's team holds, never from the input", async () => {
    const { add, notes } = sandbox()
    expect(await add('ada', 'n1')).toMatchObject({
      success: { entities: [{ id: 'n1', values: { orgId: 'acme' } }] },
    })
    expect(notes()).toEqual([{ id: 'n1', org_id: 'acme' }])
  })

  it('refuses a path that reaches no row: no team, or one hidden from the asker', async () => {
    const { add, notes } = sandbox()
    expect(await add('bo', 'n2')).toMatchObject({ failure: { _tag: 'Forbidden' } })
    expect(await add('cy', 'n3')).toMatchObject({ failure: { _tag: 'Forbidden' } })
    expect(notes()).toEqual([])
  })

  it('is refused where the server is made, when it serves no row the path reads', () => {
    expect(() => serve([source(Db.Member)])).toThrow(
      'write "AddNote" sets a member from a path through Team, which no source of this server serves',
    )
  })
})
