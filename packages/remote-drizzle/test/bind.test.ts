import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'
import {
  REMOTE_PROTOCOL_VERSION,
  Remote,
  Selection,
  emptyStore,
  initialRemoteModel,
  requirementsOf,
  type BoundRemote,
  type RemoteModel,
} from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, type AnyEntityBinding } from '../src/index.js'

const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})
const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  ownerId: text('owner_id'),
  leadId: text('lead_id').notNull(),
})
const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  projectId: text('project_id').notNull(),
  createdAt: text('created_at').notNull(),
})
const tags = sqliteTable('tags', { id: text('id').primaryKey(), name: text('name').notNull() })
const projectTags = sqliteTable('project_tags', {
  projectId: text('project_id').notNull(),
  tagId: text('tag_id').notNull(),
})

const Id = Schema.String
const User = Entity.define('User', Schema.Struct({ id: Id, name: Schema.String }))
// `name` is the Entity's word for the `title` column.
const Project = Entity.define('Project', Schema.Struct({ id: Id, name: Schema.String })).pipe(
  Entity.derived({ commentCount: Derived.make(Schema.Number) }),
)
const Comment = Entity.define('Comment', Schema.Struct({ id: Id, body: Schema.String }))
const Tag = Entity.define('Tag', Schema.Struct({ id: Id, name: Schema.String }))

const Domain = Entity.relate(
  { User, Project, Comment, Tag },
  {
    Project: {
      owner: Relation.one(User, { optional: true }),
      lead: Relation.one(User),
      comments: Relation.many(Comment),
      tags: Relation.many(Tag),
    },
    // Back to Project: a cycle, which `entity(…, { relations })` cannot declare.
    Comment: { project: Relation.one(Project) },
  },
)

const Db = bind(Domain, {
  User: { table: users },
  Project: {
    table: projects,
    fields: { name: projects.title },
    relations: {
      owner: { field: projects.ownerId },
      lead: { field: projects.leadId },
      comments: {
        foreignKey: comments.projectId,
        orderBy: [{ column: comments.createdAt, direction: 'desc' }],
      },
      tags: {
        through: projectTags,
        localColumn: projectTags.projectId,
        foreignColumn: projectTags.tagId,
      },
    },
    derived: { commentCount: { relation: 'comments' } },
  },
  Comment: { table: comments, relations: { project: { field: comments.projectId } } },
  Tag: { table: tags },
})

const setup = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table users (id text primary key, name text not null);
    create table projects (id text primary key, title text not null, owner_id text, lead_id text not null);
    create table comments (id text primary key, body text not null, project_id text not null, created_at text not null);
    create table tags (id text primary key, name text not null);
    create table project_tags (project_id text not null, tag_id text not null);
    insert into users values ('u1', 'Ada'), ('u2', 'Grace');
    insert into projects values ('p1', 'Alpha', 'u1', 'u2'), ('p2', 'Beta', null, 'u1');
    insert into comments values ('c1', 'a', 'p1', '2020-01-01'), ('c2', 'b', 'p1', '2020-01-02');
    insert into tags values ('t1', 'TypeScript'), ('t2', 'Databases');
    insert into project_tags values ('p1', 't1'), ('p1', 't2');
  `)
  return { sqlite, database: drizzle({ client: sqlite }) }
}

const read = async (binding: AnyEntityBinding, ids: string[], fields: string[]) => {
  const { sqlite, database } = setup()
  try {
    return await Effect.runPromise(
      source(binding)
        .read({ ids, fields, principal: null })
        .pipe(Effect.provide(databaseLayer(database))),
    )
  } finally {
    sqlite.close()
  }
}

describe('bind against in-process SQLite', () => {
  it('reads fields, every kind of relation, and a derived count from real SQL', async () => {
    const records = await read(
      Db.Project,
      ['p1'],
      ['id', 'name', 'owner', 'lead', 'comments', 'tags', 'commentCount'],
    )

    expect(records).toEqual([
      {
        id: 'p1',
        values: {
          id: 'p1',
          name: 'Alpha',
          owner: 'User:u1',
          lead: 'User:u2',
          comments: ['Comment:c2', 'Comment:c1'],
          tags: ['Tag:t1', 'Tag:t2'],
          commentCount: 2,
        },
      },
    ])
  })

  it('emits null for an optional one with a null foreign key', async () => {
    const records = await read(Db.Project, ['p2'], ['owner', 'comments', 'commentCount'])
    expect(records[0]?.values).toEqual({ id: 'p2', owner: null, comments: [], commentCount: 0 })
  })

  it('follows a cycle back to a binding declared earlier', async () => {
    expect(Db.Comment.relations.project.entity).toBe(Db.Project)
    expect(Db.Project.relations.comments.entity).toBe(Db.Comment)

    const records = await read(Db.Comment, ['c1'], ['body', 'project'])
    expect(records[0]?.values).toEqual({ id: 'c1', body: 'a', project: 'Project:p1' })
  })

  it('is the descriptor Remote registers for the same Entity', () => {
    expect(Db.Project.name).toBe('Project')
    expect(Object.keys(Db.Project.fields)).toEqual([
      'id',
      'name',
      'owner',
      'lead',
      'comments',
      'tags',
      'commentCount',
    ])
    expect(Db.Project.columns.name).toBe(projects.title)
    expect(Db.Project.relations.comments).toMatchObject({ kind: 'many', localKey: projects.id })
  })
})

describe('one Entity declaration, client to database', () => {
  const Card = Entity.select(Domain.Project, {
    name: true,
    commentCount: true,
    owner: Entity.select(Domain.User, { name: true }),
    lead: Entity.select(Domain.User, { name: true }),
    comments: Entity.select(Domain.Comment, { body: true, project: true }),
    tags: true,
  })

  /** What the client reads of `p1` after one round trip through RemoteServer and SQL. */
  const through = async (selection: Parameters<typeof Selection.from>[0]) => {
    const definition = Remote.define({ entities: Object.values(Db) })
    const store = { current: emptyStore }
    const bound = {
      definition,
      contract: { name: 'test' },
      store: { get: () => ({ ...initialRemoteModel, entities: store.current }) },
    } as unknown as BoundRemote<unknown, RemoteModel>
    const projection = Remote.select(bound, Selection.from(selection))('p1')
    const requests = requirementsOf(projection)

    const server = RemoteServer.make({
      entities: Object.values(Db).map(binding => source(binding)),
    })
    const { sqlite, database } = setup()
    try {
      const result = await Effect.runPromise(
        RemoteServer.handlers(server, null)
          .FoldkitRemoteRead({ version: REMOTE_PROTOCOL_VERSION, requests })
          .pipe(Effect.provide(databaseLayer(database))),
      )
      store.current = Remote.writeRead(emptyStore, requests, result)
    } finally {
      sqlite.close()
    }
    return projection.read(undefined)
  }

  it('reads an Entity Selection through RemoteServer and SQL into the value it describes', async () => {
    const read = await through(Card)
    const value = {
      name: 'Alpha',
      commentCount: 2,
      owner: { name: 'Ada' },
      lead: { name: 'Grace' },
      comments: [
        { body: 'b', project: { entity: 'Project', id: 'p1' } },
        { body: 'a', project: { entity: 'Project', id: 'p1' } },
      ],
      tags: [
        { entity: 'Tag', id: 't1' },
        { entity: 'Tag', id: 't2' },
      ],
    }
    expect(read).toEqual({ _tag: 'Ready', value })
    expect(Schema.is(Card.schema)(value)).toBe(true)
  })

  it('reads a page of a many relation as SQL windows it', async () => {
    const Body = Entity.select(Domain.Comment, { body: true })
    const Paged = Entity.select(Domain.Project, {
      name: true,
      comments: Entity.page(Body, { first: 1 }),
    })
    const value = {
      name: 'Alpha',
      comments: { items: [{ body: 'b' }], hasNext: true, hasPrevious: false },
    }
    expect(await through(Paged)).toEqual({ _tag: 'Ready', value })
    expect(Schema.is(Paged.schema)(value)).toBe(true)
  })
})

describe('bind definition errors', () => {
  const bindUntyped = bind as (entities: unknown, storage: unknown) => unknown
  const project = {
    table: projects,
    fields: { name: projects.title },
    relations: {
      owner: { field: projects.ownerId },
      lead: { field: projects.leadId },
      comments: { foreignKey: comments.projectId },
      tags: {
        through: projectTags,
        localColumn: projectTags.projectId,
        foreignColumn: projectTags.tagId,
      },
    },
    derived: { commentCount: { relation: 'comments' } },
  }
  const rest = {
    User: { table: users },
    Comment: { table: comments, relations: { project: { field: comments.projectId } } },
    Tag: { table: tags },
  }

  it.each([
    [
      'a field with no column',
      { ...project, fields: {} },
      'field "name" on entity "Project" has no column',
    ],
    [
      'a relation with no storage',
      { ...project, relations: { ...project.relations, tags: undefined } },
      'relation "tags" on entity "Project" has no storage',
    ],
    [
      'a one stored as a many',
      { ...project, relations: { ...project.relations, lead: { foreignKey: comments.projectId } } },
      'relation "lead" on entity "Project" is one: give its "field"',
    ],
    [
      'a many stored as a one',
      { ...project, relations: { ...project.relations, comments: { field: projects.leadId } } },
      'relation "comments" on entity "Project" is many: give "foreignKey" or "through"',
    ],
    [
      'a required one over a nullable column',
      { ...project, relations: { ...project.relations, lead: { field: projects.ownerId } } },
      'relation "lead" on entity "Project" points at a nullable column',
    ],
    [
      'a through table with a column missing',
      { ...project, relations: { ...project.relations, tags: { through: projectTags } } },
      'relation "tags" on entity "Project" goes through a table: give "localColumn"',
    ],
    [
      'a derived member with no storage',
      { ...project, derived: {} },
      'derived "commentCount" on entity "Project" has no storage',
    ],
    [
      'a count over a one relation',
      { ...project, derived: { commentCount: { relation: 'lead' } } },
      'derived "commentCount" on entity "Project" needs a many relation, not "lead"',
    ],
  ])('rejects %s', (_, storage, message) => {
    expect(() => bindUntyped(Domain, { ...rest, Project: storage })).toThrow(message)
  })

  it('rejects an Entity with no table, and a target that is not being bound', () => {
    expect(() => bindUntyped(Domain, { ...rest, Project: project, Tag: undefined })).toThrow(
      'entity "Tag" has no table',
    )
    const { Tag: _, ...withoutTag } = Domain
    expect(() => bindUntyped(withoutTag, { ...rest, Project: project })).toThrow(
      'relation "tags" on entity "Project" targets an Entity that is not being bound',
    )
  })

  it('rejects count storage for a derived member that is not a number', () => {
    const Labelled = Entity.relate(
      {
        User,
        Thing: Entity.define('Thing', Schema.Struct({ id: Id })).pipe(
          Entity.derived({ summary: Derived.make(Schema.String) }),
        ),
      },
      { Thing: { owners: Relation.many(User) } },
    )
    expect(() =>
      bindUntyped(Labelled, {
        User: { table: users },
        Thing: {
          table: tags,
          relations: { owners: { foreignKey: users.id } },
          derived: { summary: { relation: 'owners' } },
        },
      }),
    ).toThrow(
      'derived "summary" on entity "Thing" is stored as a count, but its schema is not a number',
    )
  })
})
