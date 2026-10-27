import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, type AnyEntityBinding } from '../src/index.js'

const users = sqliteTable('users', { id: text('id').primaryKey() })
const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull(),
})
const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  projectId: text('project_id').notNull(),
})

const Id = Schema.String
const UserFields = Entity.define('User', Schema.Struct({ id: Id }))
const ProjectFields = Entity.define('Project', Schema.Struct({ id: Id }))
const CommentFields = Entity.define('Comment', Schema.Struct({ id: Id, body: Schema.String }))
const Work = Entity.relate(
  { User: UserFields, Project: ProjectFields, Comment: CommentFields },
  {
    Project: { lead: Relation.one(UserFields) },
    Comment: { project: Relation.one(ProjectFields) },
  },
)
const User = Work.User.pipe(Entity.derived({ leading: Derived.count(Work.Project.relations.lead) }))
const Project = Work.Project.pipe(
  Entity.derived({ commentCount: Derived.count(Work.Comment.relations.project) }),
)

const Db = bind(
  { User, Project, Comment: Work.Comment },
  {
    User: { table: users },
    Project: { table: projects, relations: { lead: { field: projects.leadId } } },
    Comment: {
      table: comments,
      relations: { project: { field: comments.projectId } },
      // A visitor sees only the comments saying "a"; Ada sees every one.
      visible: principal => (principal === 'ada' ? undefined : eq(comments.body, 'a')),
    },
  },
)

const read = async (
  binding: AnyEntityBinding,
  ids: string[],
  fields: string[],
  principal: string | null = null,
) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table users (id text primary key);
    create table projects (id text primary key, lead_id text not null);
    create table comments (id text primary key, body text not null, project_id text not null);
    insert into users values ('u1'), ('u2');
    insert into projects values ('p1', 'u1'), ('p2', 'u1'), ('p3', 'u2');
    insert into comments values ('c1', 'a', 'p1'), ('c2', 'b', 'p1'), ('c3', 'a', 'p2');
  `)
  try {
    return await Effect.runPromise(
      source(binding)
        .read({ ids, fields, principal })
        .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
  } finally {
    sqlite.close()
  }
}

describe('a Derived.count, compiled by bind', () => {
  it('counts the rows pointing at each row, with no binding entry', async () => {
    expect(await read(Db.User, ['u1', 'u2'], ['leading'])).toEqual([
      { id: 'u1', values: { id: 'u1', leading: 2 } },
      { id: 'u2', values: { id: 'u2', leading: 1 } },
    ])
    expect(await read(Db.Project, ['p1', 'p2', 'p3'], ['commentCount'], 'ada')).toEqual([
      { id: 'p1', values: { id: 'p1', commentCount: 2 } },
      { id: 'p2', values: { id: 'p2', commentCount: 1 } },
      { id: 'p3', values: { id: 'p3', commentCount: 0 } },
    ])
  })

  it('counts only the rows the principal may see', async () => {
    expect(await read(Db.Project, ['p1'], ['commentCount'], 'visitor')).toEqual([
      { id: 'p1', values: { id: 'p1', commentCount: 1 } },
    ])
  })
})

describe('a Derived.count, refused where it is bound', () => {
  it('refuses an entry for it: the Entity already says what it counts', () => {
    expect(() =>
      bind(
        { User, Project: Work.Project, Comment: Work.Comment },
        {
          // @ts-expect-error a Derived.count takes no storage
          User: { table: users, derived: { leading: { relation: 'lead' } } },
          Project: { table: projects, relations: { lead: { field: projects.leadId } } },
          Comment: { table: comments, relations: { project: { field: comments.projectId } } },
        },
      ),
    ).toThrow('derived "leading" on entity "User" is a Derived.count, which bind compiles')
  })

  it('refuses a count of an Entity that is not being bound', () => {
    expect(() =>
      bind(
        { User: Work.User, Project },
        {
          User: { table: users },
          Project: { table: projects, relations: { lead: { field: projects.leadId } } },
        },
      ),
    ).toThrow('counts Comment.project, but Comment is not being bound')
  })
})
