// @vitest-environment node
/**
 * A collection relation read whole (no window) holds at most `maxCollection`
 * rows of one parent: at the bound it is read whole, past it the read is
 * refused rather than cut short, and the statement selects no more than one
 * past the bound a parent. A window, or the one row of an inverse one-to-one,
 * is not held to it. On SQLite and PGlite.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, type Layer, Schema } from 'effect'
import { Entity as Domain, Relation } from 'foldkit-entity'
import { Entity } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, type DrizzleDatabase } from '../src/index.js'

const Fields = {
  Project: Domain.define('Project', Schema.Struct({ id: Schema.String, title: Schema.String })),
  Comment: Domain.define('Comment', Schema.Struct({ id: Schema.String })),
  Charter: Domain.define('Charter', Schema.Struct({ id: Schema.String })),
}
const Related = Domain.relate(Fields, {
  Project: {
    comments: Relation.many(Fields.Comment),
    charter: Relation.one(Fields.Charter, { optional: true }),
  },
})

const sqliteDb = (() => {
  const projects = sqliteTable('projects', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
  })
  const comments = sqliteTable('comments', {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
  })
  const charters = sqliteTable('charters', {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
  })
  return bind(Related, {
    Project: {
      table: projects,
      relations: {
        comments: { foreignKey: comments.projectId },
        // Vouched for, and broken below: two charters point at p1.
        charter: { foreignKey: charters.projectId, assumeUnique: true },
      },
    },
    Comment: { table: comments },
    Charter: { table: charters },
  })
})()

const pgDb = (() => {
  const projects = pgTable('projects', {
    id: pgText('id').primaryKey(),
    title: pgText('title').notNull(),
  })
  const comments = pgTable('comments', {
    id: pgText('id').primaryKey(),
    projectId: pgText('project_id').notNull(),
  })
  const charters = pgTable('charters', {
    id: pgText('id').primaryKey(),
    projectId: pgText('project_id').notNull(),
  })
  return bind(Related, {
    Project: {
      table: projects,
      relations: {
        comments: { foreignKey: comments.projectId },
        charter: { foreignKey: charters.projectId, assumeUnique: true },
      },
    },
    Comment: { table: comments },
    Charter: { table: charters },
  })
})()

const SCHEMA = `
  create table projects (id text primary key, title text not null);
  create table comments (id text primary key, project_id text not null);
  create table charters (id text primary key, project_id text not null);
  insert into projects values ('p1', 'Alpha'), ('p2', 'Beta');
  insert into charters values ('h1', 'p1'), ('h2', 'p1');
`

/** `count` comments of `project`, ids `<project>-c<n>` padded so they sort as numbered. */
const commentsOf = (project: string, count: number) =>
  Array.from(
    { length: count },
    (_, at) => `('${project}-c${String(at).padStart(3, '0')}', '${project}')`,
  ).join(', ')

const refs = (project: string, count: number) =>
  Array.from({ length: count }, (_, at) =>
    Entity.refKey({ entity: 'Comment', id: `${project}-c${String(at).padStart(3, '0')}` }),
  )

interface Backend {
  readonly name: string
  readonly project: typeof sqliteDb.Project | typeof pgDb.Project
  /** A database holding `p1`'s and `p2`'s comments, and the parameters of every statement run. */
  readonly open: (
    p1: number,
    p2: number,
  ) => Promise<{ layer: Layer.Layer<DrizzleDatabase>; params: Array<ReadonlyArray<unknown>> }>
}

let pglite: PGlite
const backends: ReadonlyArray<Backend> = [
  {
    name: 'SQLite',
    project: sqliteDb.Project,
    open: async (p1, p2) => {
      const client = new DatabaseSync(':memory:')
      client.exec(SCHEMA)
      for (const [project, count] of [
        ['p1', p1],
        ['p2', p2],
      ] as const) {
        if (count > 0) client.exec(`insert into comments values ${commentsOf(project, count)}`)
      }
      const params: Array<ReadonlyArray<unknown>> = []
      const logger = { logQuery: (_: string, given: Array<unknown>) => void params.push(given) }
      return { layer: databaseLayer(drizzle({ client, logger })), params }
    },
  },
  {
    name: 'PGlite',
    project: pgDb.Project,
    open: async (p1, p2) => {
      await pglite.exec('drop table if exists projects, comments, charters')
      await pglite.exec(SCHEMA)
      for (const [project, count] of [
        ['p1', p1],
        ['p2', p2],
      ] as const) {
        if (count > 0)
          await pglite.exec(`insert into comments values ${commentsOf(project, count)}`)
      }
      const params: Array<ReadonlyArray<unknown>> = []
      const logger = { logQuery: (_: string, given: Array<unknown>) => void params.push(given) }
      return { layer: databaseLayer(drizzlePg({ client: pglite, logger })), params }
    },
  },
]

beforeAll(async () => {
  pglite = await PGlite.create()
})
afterAll(async () => {
  await pglite.close()
})

describe.each(backends)('a collection relation read whole, on $name', backend => {
  /** Reads `fields` of both projects; the records by id, or the failure's message. */
  const read = async (
    counts: readonly [number, number],
    fields: ReadonlyArray<string>,
    options: {
      readonly maxCollection?: number
      readonly windows?: Record<string, { first: number }>
    } = {},
  ) => {
    const { layer, params } = await backend.open(...counts)
    const result = await Effect.runPromise(
      Effect.result(
        source<string>(backend.project, { maxCollection: options.maxCollection }).read({
          ids: ['p1', 'p2'],
          fields: [...fields],
          principal: 'ada',
          ...(options.windows === undefined ? {} : { windows: options.windows }),
        }),
      ).pipe(Effect.provide(layer)),
    )
    return {
      params,
      outcome:
        result._tag === 'Success'
          ? Object.fromEntries(result.success.map(record => [record.id, record.values]))
          : result.failure.message,
    }
  }

  it('is read whole at the bound', async () => {
    const { outcome } = await read([2, 1], ['comments'], { maxCollection: 2 })
    expect(outcome).toEqual({
      p1: { id: 'p1', comments: refs('p1', 2) },
      p2: { id: 'p2', comments: refs('p2', 1) },
    })
  })

  it('is refused past the bound, naming the relation, not cut short', async () => {
    const { outcome } = await read([1, 3], ['comments'], { maxCollection: 2 })
    expect(outcome).toBe(
      "Project.comments holds more than 2 rows for one Project, more than a read of it whole may: read it with a window (Entity.page), or raise the source's maxCollection",
    )
  })

  it('selects no more than one past the bound a parent', async () => {
    const { params } = await read([2, 2], ['comments'], { maxCollection: 2 })
    // The rank the statement keeps up to, a parameter of the comments' read.
    expect(params.some(given => given.includes(3))).toBe(true)
    expect(params.some(given => given.includes(4) || given.includes(101))).toBe(false)
  })

  it('holds 100 by default, and takes more when raised', async () => {
    expect((await read([100, 0], ['comments'])).outcome).toMatchObject({
      p1: { comments: refs('p1', 100) },
    })
    expect((await read([101, 0], ['comments'])).outcome).toContain(
      'Project.comments holds more than 100 rows',
    )
    expect((await read([101, 0], ['comments'], { maxCollection: 101 })).outcome).toMatchObject({
      p1: { comments: refs('p1', 101) },
    })
  })

  it('does not hold a window to it', async () => {
    const { outcome } = await read([3, 0], ['comments'], {
      maxCollection: 1,
      windows: { comments: { first: 3 } },
    })
    expect(outcome).toMatchObject({ p1: { comments: { refs: refs('p1', 3), hasNext: false } } })
  })

  it('reads the one row of an inverse one-to-one, however many point back', async () => {
    const { outcome } = await read([0, 0], ['charter'], { maxCollection: 1 })
    expect(outcome).toEqual({
      p1: { id: 'p1', charter: Entity.refKey({ entity: 'Charter', id: 'h1' }) },
      p2: { id: 'p2', charter: null },
    })
  })
})

describe('maxCollection', () => {
  it.each([0, 1.5])('refuses %s, when the source is made', maxCollection => {
    expect(() => source(sqliteDb.Project, { maxCollection })).toThrow(
      "Project's maxCollection must be a whole number above 0",
    )
  })
})
