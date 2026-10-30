// @vitest-environment node
/**
 * What a guarded write's answer reads of the rows its row points at: only what
 * its writer could have read of the row, and nothing for a write that wrote nothing.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Derived, Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['member', 'cleaner']) })
type User = typeof User.Type

const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  leadId: text('lead_id').notNull(),
})
const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  projectId: text('project_id').notNull(),
})

const ProjectFields = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, leadId: Schema.String }),
)
const Related = Entity.relate(
  {
    Project: ProjectFields,
    Note: Entity.define('Note', Schema.Struct({ id: Schema.String, ownerId: Schema.String })),
  },
  { Note: { project: Relation.one(ProjectFields) } },
)
// A project counts its notes, so a note's write names its project for the answer to read.
Related.Project.pipe(Entity.derived({ noteCount: Derived.count(Related.Note.relations.project) }))

const G = Guards.declare(
  'Notes',
  User,
  guard => ({
    isCleaner: guard.principal(),
    isOwner: guard.row(Related.Note, p => Expr.eq(Related.Note.fields.ownerId, p.id)),
    isLead: guard.row(Related.Project, p => Expr.eq(Related.Project.fields.leadId, p.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)

// A cleaner reads and deletes any note, but not which project it is in.
const Note = Related.Note.pipe(
  Guards.attach(G, {
    row: { Read: [G.isOwner, G.isCleaner], Delete: [G.isOwner, G.isCleaner] },
    relations: { project: { Read: [G.isOwner] } },
  }),
)

// Only its lead reads a project.
const Project = Related.Project.pipe(Guards.attach(G, { row: { Read: [G.isLead] } }))

const Policy = G.implement({
  isCleaner: principal => Option.exists(principal, user => user.role === 'cleaner'),
})

const visible = GuardDrizzle.visible(Policy, [Note, Project])
const Db = bind(
  { Note, Project },
  {
    Note: {
      table: notes,
      relations: { project: { field: notes.projectId } },
      visible: visible.Note,
    },
    Project: { table: projects, visible: visible.Project },
  },
)

const DeleteNote = Mutation.write(
  'DeleteNote',
  Write.delete(Entity.input(Note, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [source(Db.Project), source(Db.Note, { filter: GuardServer.filter(Note, Policy) })],
  mutations: [RemoteServer.write(DeleteNote, GuardServer.writer(Note, Policy, writer(Db.Note)))],
})

const bob = Option.some<User>({ id: 'bob', role: 'member' })
const mallory = Option.some<User>({ id: 'mallory', role: 'member' })
const carol = Option.some<User>({ id: 'carol', role: 'cleaner' })

/** `DeleteNote` of `id` as `principal`, showing `fields` of each Project. */
const remove = (principal: Option.Option<User>, id: string, fields: ReadonlyArray<string>) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table projects (id text primary key, name text not null, lead_id text not null);
    create table notes (id text primary key, owner_id text not null, project_id text not null);
    insert into projects values ('secret-merger', 'Secret merger', 'bob'), ('closed', 'Closed', 'zed');
    insert into notes values
      ('n1', 'bob', 'secret-merger'), ('n2', 'bob', 'secret-merger'), ('n3', 'bob', 'closed');
  `)
  return Effect.runPromise(
    RemoteServer.handlers(server, principal)
      .FoldkitRemoteMutate({
        requestId: 'r',
        mutation: 'DeleteNote',
        input: { id },
        shown: [{ entity: 'Project', fields: [...fields] }],
      })
      .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  ).finally(() => sqlite.close())
}

describe('a guarded delete’s answer', () => {
  it('reads the row its writer’s delete pointed at', async () => {
    const answer = await remove(bob, 'n1', ['name'])
    expect(answer.read?.result.entities).toEqual([
      { entity: 'Project', id: 'secret-merger', values: { name: 'Secret merger' } },
    ])
  })

  it('answers a delete of a row hidden from its writer as one of a row never there', async () => {
    for (const fields of [['name'], ['bogus']]) {
      const hidden = await remove(mallory, 'n1', fields)
      const never = await remove(mallory, 'n9', fields)
      expect(hidden).toEqual({ ...never, deleted: [{ entity: 'Note', id: 'n1' }] })
      expect(never.read).toBeUndefined()
      expect(JSON.stringify(hidden)).not.toContain('secret-merger')
    }
  })

  it('reads nothing of a row it points at that its writer may not read', async () => {
    for (const fields of [['name'], ['bogus']]) {
      const answer = await remove(bob, 'n3', fields)
      expect(answer.deleted).toEqual([{ entity: 'Note', id: 'n3' }])
      expect(answer.read).toBeUndefined()
    }
  })

  it('names no row through a relation its writer may not read', async () => {
    const answer = await remove(carol, 'n2', ['name'])
    expect(answer.deleted).toEqual([{ entity: 'Note', id: 'n2' }])
    expect(JSON.stringify(answer)).not.toContain('secret-merger')
  })
})
