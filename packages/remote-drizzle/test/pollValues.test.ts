// @vitest-environment node
/**
 * `pollLive` over real SQLite: a field whose read makes a new value each time
 * (a collection relation's refs) patches only when what it holds changes, so
 * a quiet tick sends nothing, whoever subscribes to it.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Fiber, Layer, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { Entity, Relation } from 'foldkit-entity'
import type { LiveChange } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, pollLive, source } from '../src/index.js'

const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
})
const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
})
const Fields = {
  Project: Entity.define('Project', Schema.Struct({ id: Schema.String, title: Schema.String })),
  Comment: Entity.define('Comment', Schema.Struct({ id: Schema.String })),
}
const Domain = Entity.relate(Fields, { Project: { comments: Relation.many(Fields.Comment) } })
const Db = bind(Domain, {
  Project: {
    table: projects,
    relations: { comments: { foreignKey: comments.projectId } },
  },
  Comment: { table: comments },
})

/**
 * The patches a stream sends over three ticks, a comment added to `p1` before
 * the last: subscribed to `p1`'s `fields`, or listing it with them.
 */
const sent = (fields: ReadonlyArray<string>, by: 'row' | 'list') => {
  const client = new DatabaseSync(':memory:')
  client.exec(`
    create table projects (id text primary key, title text not null);
    create table comments (id text primary key, project_id text not null);
    insert into projects values ('p1', 'Alpha');
    insert into comments values ('c1', 'p1');
  `)
  return Effect.runPromise(
    Effect.gen(function* () {
      const seen: Array<Schema.Schema.Type<typeof LiveChange>> = []
      const fiber = yield* pollLive(source(Db.Project), { every: '1 second' })
        .subscribe({
          requirements: by === 'row' ? [{ entity: 'Project', id: 'p1', fields: [...fields] }] : [],
          queries:
            by === 'list'
              ? [
                  {
                    identity: 'projects',
                    select: { entity: 'Project', fields: [...fields] },
                    edges: Effect.succeed([{ entity: 'Project', id: 'p1', key: 'Project:p1' }]),
                  },
                ]
              : [],
          after: 0,
          principal: 'ada',
        })
        .pipe(
          Stream.filter(change => change._tag === 'EntityPatched'),
          Stream.runForEach(change => Effect.sync(() => void seen.push(change))),
          Effect.forkChild,
        )
      const tick = Effect.gen(function* () {
        yield* TestClock.adjust('1 second')
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      })
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      yield* tick
      yield* tick
      const quiet = seen.length
      client.exec("insert into comments values ('c2', 'p1')")
      yield* tick
      yield* Fiber.interrupt(fiber)
      return { quiet, after: seen.slice(quiet) }
    }).pipe(
      Effect.provide(Layer.merge(TestClock.layer(), databaseLayer(drizzle({ client })))),
      Effect.ensuring(Effect.sync(() => client.close())),
    ),
  )
}

describe.each(['row', 'list'] as const)('pollLive comparing what a field holds, by %s', by => {
  it('sends nothing on a quiet tick for a collection relation, and its change when one lands', async () => {
    const { quiet, after } = await sent(['title', 'comments'], by)
    expect(quiet).toBe(0)
    expect(after).toEqual([
      expect.objectContaining({
        _tag: 'EntityPatched',
        id: 'p1',
        changed: ['comments'],
        values: { comments: ['Comment:c1', 'Comment:c2'] },
      }),
    ])
  })
})
