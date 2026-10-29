// @vitest-environment node
/**
 * The work of a collection read is bounded, not only its rows: the database
 * visits as many child rows for a parent holding 20,000 children as for one
 * holding 5,000, read whole (and refused) or through a window, by a foreign
 * key or a through table, given an index on the parent column and the order.
 * Each backend counts the rows it visits, so no timing is involved: SQLite
 * reads the children through views that count every row they pass
 * (`visit()`), and Postgres reports them in `explain analyze` of each
 * statement the read ran. Below a few thousand rows Postgres may choose a
 * sequential scan, which is cheap there and visits more.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
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
  Comment: Entity.define('Comment', Schema.Struct({ id: Schema.String })),
  Tag: Entity.define('Tag', Schema.Struct({ id: Schema.String })),
}
const Related = Entity.relate(Fields, {
  Project: { comments: Relation.many(Fields.Comment), tags: Relation.many(Fields.Tag) },
})

const sqliteProject = (() => {
  const projects = sqliteTable('projects', { id: text('id').primaryKey() })
  const comments = sqliteTable('comments', {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
  })
  const tags = sqliteTable('tags', { id: text('id').primaryKey() })
  const projectTags = sqliteTable('project_tags', {
    projectId: text('project_id').notNull(),
    tagId: text('tag_id').notNull(),
  })
  return bind(Related, {
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
})()

const pgProject = (() => {
  const projects = pgTable('projects', { id: pgText('id').primaryKey() })
  const comments = pgTable('comments', {
    id: pgText('id').primaryKey(),
    projectId: pgText('project_id').notNull(),
  })
  const tags = pgTable('tags', { id: pgText('id').primaryKey() })
  const projectTags = pgTable('project_tags', {
    projectId: pgText('project_id').notNull(),
    tagId: pgText('tag_id').notNull(),
  })
  return bind(Related, {
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
})()

type Field = 'comments' | 'tags'
interface Asked {
  readonly maxCollection?: number
  readonly first?: number
}

/** Reads `field` of both projects: each one's value, or the failure's message. */
const ask = (
  project: typeof sqliteProject | typeof pgProject,
  layer: Layer.Layer<DrizzleDatabase>,
  field: Field,
  asked: Asked,
) =>
  Effect.runPromise(
    Effect.result(
      source<string>(project, { maxCollection: asked.maxCollection }).read({
        ids: ['p1', 'p2'],
        fields: [field],
        principal: 'ada',
        ...(asked.first === undefined ? {} : { windows: { [field]: { first: asked.first } } }),
      }),
    ).pipe(
      Effect.map(result =>
        result._tag === 'Success'
          ? Object.fromEntries(result.success.map(record => [record.id, record.values[field]]))
          : result.failure.message,
      ),
      Effect.provide(layer),
    ),
  )

interface PlanNode {
  readonly 'Relation Name'?: string
  readonly 'Actual Rows': number
  readonly 'Actual Loops': number
  readonly 'Rows Removed by Filter'?: number
  readonly Plans?: ReadonlyArray<PlanNode>
}

/** Every row a node over a child table passed or dropped, over every loop. */
const visitedIn = (node: PlanNode): number =>
  (node['Relation Name'] === 'comments' || node['Relation Name'] === 'project_tags'
    ? (node['Actual Rows'] + (node['Rows Removed by Filter'] ?? 0)) * node['Actual Loops']
    : 0) + (node.Plans ?? []).reduce((sum, child) => sum + visitedIn(child), 0)

let pglite: PGlite
beforeAll(async () => {
  pglite = await PGlite.create()
})
afterAll(async () => {
  await pglite.close()
})

interface Backend {
  readonly name: string
  /** The read's outcome, `p1` holding `many` children and `p2` two, and the child rows visited. */
  readonly read: (
    field: Field,
    asked: Asked,
    many: number,
  ) => Promise<{ outcome: unknown; visited: number }>
}

const backends: ReadonlyArray<Backend> = [
  {
    name: 'SQLite',
    read: async (field, asked, many) => {
      const client = new DatabaseSync(':memory:')
      let visited = 0
      client.function('visit', { deterministic: false }, () => {
        visited++
        return 1
      })
      client.exec(`
        create table projects (id text primary key);
        create table comments_rows (id text primary key, project_id text not null);
        create index comments_by_project on comments_rows (project_id, id);
        create table tags (id text primary key);
        create table project_tags_rows (project_id text not null, tag_id text not null);
        create index tags_by_project on project_tags_rows (project_id, tag_id);
        create view comments as select * from comments_rows where visit();
        create view project_tags as select * from project_tags_rows where visit();
        insert into projects values ('p1'), ('p2');
        create temp table children as
          with recursive n(value) as (select 0 union all select value + 1 from n where value < ${many - 1})
          select 'p1' as p, value as n from n union all select 'p2', 0 union all select 'p2', 1;
        insert into comments_rows select printf('%s-c%06d', p, n), p from children;
        insert into tags select printf('%s-t%06d', p, n) from children;
        insert into project_tags_rows select p, printf('%s-t%06d', p, n) from children;
        analyze;
      `)
      visited = 0
      const outcome = await ask(sqliteProject, databaseLayer(drizzle({ client })), field, asked)
      return { outcome, visited }
    },
  },
  {
    name: 'PGlite',
    read: async (field, asked, many) => {
      await pglite.exec(`
        drop table if exists projects, comments, tags, project_tags;
        create table projects (id text primary key);
        create table comments (id text primary key, project_id text not null);
        create index comments_by_project on comments (project_id, id);
        create table tags (id text primary key);
        create table project_tags (project_id text not null, tag_id text not null);
        create index tags_by_project on project_tags (project_id, tag_id);
        insert into projects values ('p1'), ('p2');
        create temp table children as
          select 'p1' as p, n from generate_series(0, ${many - 1}) as n
          union all select 'p2', 0 union all select 'p2', 1;
        insert into comments select format('%s-c%s', p, lpad(n::text, 6, '0')), p from children;
        insert into tags select format('%s-t%s', p, lpad(n::text, 6, '0')) from children;
        insert into project_tags select p, format('%s-t%s', p, lpad(n::text, 6, '0')) from children;
        drop table children;
        analyze;
      `)
      const statements: Array<{ query: string; params: Array<unknown> }> = []
      const logger = {
        logQuery: (query: string, params: Array<unknown>) =>
          void statements.push({ query, params }),
      }
      const layer = databaseLayer(drizzlePg({ client: pglite, logger }))
      const outcome = await ask(pgProject, layer, field, asked)
      let visited = 0
      for (const { query, params } of statements) {
        const explained = await pglite.query<{ 'QUERY PLAN': ReadonlyArray<{ Plan: PlanNode }> }>(
          `explain (analyze, format json) ${query}`,
          params,
        )
        visited += visitedIn(explained.rows[0]!['QUERY PLAN'][0]!.Plan)
      }
      return { outcome, visited }
    },
  },
]

describe.each(backends)('a collection relation read on $name', backend => {
  /** The child rows visited for a parent holding 5,000 children, and for one holding 20,000. */
  const visits = async (field: Field, asked: Asked, check: (outcome: unknown) => void) => {
    const fewer = await backend.read(field, asked, 5000)
    const more = await backend.read(field, asked, 20000)
    check(fewer.outcome)
    check(more.outcome)
    return [fewer.visited, more.visited]
  }

  it.each(['comments', 'tags'] as const)(
    'visits as many %s to refuse a parent however many it holds',
    async field => {
      const [fewer, more] = await visits(field, { maxCollection: 2 }, outcome =>
        expect(outcome).toContain(`Project.${field} holds more than 2 rows`),
      )
      expect(fewer).toBeGreaterThan(0)
      expect(more).toBe(fewer)
    },
  )

  it.each(['comments', 'tags'] as const)(
    'visits as many %s for a window of a parent however many it holds',
    async field => {
      const [fewer, more] = await visits(field, { first: 2 }, outcome =>
        expect(outcome).toMatchObject({ p1: { hasNext: true }, p2: { hasNext: false } }),
      )
      expect(fewer).toBeGreaterThan(0)
      expect(more).toBe(fewer)
    },
  )
})
