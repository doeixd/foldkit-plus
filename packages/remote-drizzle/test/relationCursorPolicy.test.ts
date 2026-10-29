// @vitest-environment node
/**
 * A relation page's cursor is placed only by a child the page could show
 * (#290): one the relation's `policies` filter hides answers as a missing one
 * does, by a foreign key and through a table, on SQLite and Postgres.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { ne, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, type Layer, Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, type DrizzleDatabase } from '../src/index.js'

const Fields = {
  Project: Entity.define('Project', Schema.Struct({ id: Schema.String })),
  Comment: Entity.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String })),
  Tag: Entity.define('Tag', Schema.Struct({ id: Schema.String, name: Schema.String })),
}
const Related = Entity.relate(Fields, {
  Project: { comments: Relation.many(Fields.Comment), tags: Relation.many(Fields.Tag) },
})

const sqliteTables = (() => {
  const projects = sqliteTable('projects', { id: text('id').primaryKey() })
  const comments = sqliteTable('comments', {
    id: text('id').primaryKey(),
    body: text('body').notNull(),
    projectId: text('project_id').notNull(),
  })
  const tags = sqliteTable('tags', { id: text('id').primaryKey(), name: text('name').notNull() })
  const projectTags = sqliteTable('project_tags', {
    projectId: text('project_id').notNull(),
    tagId: text('tag_id').notNull(),
  })
  const Project = bind(Related, {
    Project: {
      table: projects,
      relations: {
        comments: { foreignKey: comments.projectId },
        tags: {
          through: projectTags,
          localColumn: projectTags.projectId,
          foreignColumn: projectTags.tagId,
        },
      },
    },
    Comment: { table: comments },
    Tag: { table: tags },
  }).Project
  return { Project, comments, tags }
})()
const pgTables = (() => {
  const projects = pgTable('projects', { id: pgText('id').primaryKey() })
  const comments = pgTable('comments', {
    id: pgText('id').primaryKey(),
    body: pgText('body').notNull(),
    projectId: pgText('project_id').notNull(),
  })
  const tags = pgTable('tags', { id: pgText('id').primaryKey(), name: pgText('name').notNull() })
  const projectTags = pgTable('project_tags', {
    projectId: pgText('project_id').notNull(),
    tagId: pgText('tag_id').notNull(),
  })
  const Project = bind(Related, {
    Project: {
      table: projects,
      relations: {
        comments: { foreignKey: comments.projectId },
        tags: {
          through: projectTags,
          localColumn: projectTags.projectId,
          foreignColumn: projectTags.tagId,
        },
      },
    },
    Comment: { table: comments },
    Tag: { table: tags },
  }).Project
  return { Project, comments, tags }
})()

const statements = [
  'create table projects (id text primary key)',
  'create table comments (id text primary key, body text not null, project_id text not null)',
  'create table tags (id text primary key, name text not null)',
  'create table project_tags (project_id text not null, tag_id text not null)',
  "insert into projects values ('p1')",
  "insert into comments values ('c1', 'a', 'p1'), ('c2', 'secret', 'p1'), ('c3', 'b', 'p1')",
  "insert into tags values ('t1', 'a'), ('t2', 'secret'), ('t3', 'b')",
  "insert into project_tags values ('p1', 't1'), ('p1', 't2'), ('p1', 't3')",
]

const dialects = [
  {
    name: 'SQLite',
    tables: sqliteTables,
    open: async () => {
      const client = new DatabaseSync(':memory:')
      for (const statement of statements) client.exec(statement)
      return { layer: databaseLayer(drizzle({ client })), close: async () => client.close() }
    },
  },
  {
    name: 'Postgres',
    tables: pgTables,
    open: async () => {
      const client = new PGlite()
      const db = drizzlePg({ client })
      for (const statement of statements) await db.execute(sql.raw(statement))
      return { layer: databaseLayer(db), close: () => client.close() }
    },
  },
]

describe.each(dialects)('a relation cursor under its policy, on $name', ({ tables, open }) => {
  let database: {
    readonly layer: Layer.Layer<DrizzleDatabase>
    readonly close: () => Promise<void>
  }
  beforeAll(async () => {
    database = await open()
  }, 60_000)
  afterAll(() => database.close())

  const { Project } = tables
  // Every principal is kept from the children marked secret; no Read rule hides them.
  const read = (field: 'comments' | 'tags', after: string) =>
    Effect.runPromise(
      Effect.result(
        source<string>(Project, {
          policies: {
            comments: () => ne(tables.comments.body, 'secret'),
            tags: () => ne(tables.tags.name, 'secret'),
          },
        }).read({
          ids: ['p1'],
          fields: [field],
          principal: 'ada',
          windows: { [field]: { first: 1, after } },
        }),
      ).pipe(
        Effect.map(result =>
          result._tag === 'Success' ? result.success[0]?.values[field] : result.failure.message,
        ),
        Effect.provide(database.layer),
      ),
    )

  it.each([
    ['comments', 'Comment'],
    ['tags', 'Tag'],
  ] as const)('pages %s after a child the page could show', async (field, entity) => {
    expect(await read(field, `${entity}:${entity[0]!.toLowerCase()}1`)).toEqual({
      refs: [`${entity}:${entity[0]!.toLowerCase()}3`],
      hasNext: false,
      hasPrevious: true,
    })
  })

  it.each([
    ['comments', 'Comment'],
    ['tags', 'Tag'],
  ] as const)(
    'refuses a cursor naming a child its policy hides, as a missing one',
    async (field, entity) => {
      const letter = entity[0]!.toLowerCase()
      expect(await read(field, `${entity}:${letter}9`)).toBe(
        `Relation "${field}" cursor no longer resolves`,
      )
      expect(await read(field, `${entity}:${letter}2`)).toBe(
        `Relation "${field}" cursor no longer resolves`,
      )
    },
  )
})
