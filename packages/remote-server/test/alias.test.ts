/**
 * A page of a whole list is read under an alias (`comments@first=1`). The
 * server reads the name apart: a source sees the field it knows with one window,
 * and the answer goes back under the alias, beside the whole list when both are
 * asked for.
 */
import { Effect, Fiber, Schema, Stream } from 'effect'
import { RpcTest } from 'effect/unstable/rpc'
import {
  Entity,
  REMOTE_PROTOCOL_VERSION,
  RemoteRpc,
  relationAlias,
  type ReadRequest,
} from 'foldkit-remote'
import { beforeEach, describe, expect, it } from 'vitest'
import { RemoteServer } from '../src/index.js'

type Request = Schema.Schema.Type<typeof ReadRequest>

const Comment = Entity.make('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    secret: Schema.String,
    comments: Schema.Array(Entity.ref(Comment)),
  }),
)

const rows: Record<string, Record<string, unknown>> = {
  'Project:p1': { name: 'Apollo', secret: 's', comments: ['Comment:c1', 'Comment:c2'] },
  'Comment:c1': { body: 'one' },
  'Comment:c2': { body: 'two' },
}
const reads: Array<{ entity: string; fields: ReadonlyArray<string>; windows: unknown }> = []

/** A source that pages `comments` when it is asked to, as a database adapter does. */
const source = <Name extends string>(entity: { readonly name: Name }) =>
  RemoteServer.entity<string>(entity, {
    authorize: (principal, fields) =>
      principal === 'admin' ? fields : fields.filter(field => field !== 'comments'),
    read: ({ ids, fields, windows }) =>
      Effect.sync(() => {
        reads.push({ entity: entity.name, fields, windows })
        return ids.flatMap(id => {
          const row = rows[`${entity.name}:${id}`]
          if (row === undefined) return []
          const values = Object.fromEntries(
            fields.map(field => {
              const window = windows?.[field]
              const held = row[field]
              return [
                field,
                window === undefined || !Array.isArray(held)
                  ? held
                  : {
                      refs: held.slice(0, window.first),
                      hasNext: held.length > (window.first ?? 0),
                      hasPrevious: false,
                    },
              ]
            }),
          )
          return [{ id, values }]
        })
      }),
  })

const server = RemoteServer.make({ entities: [source(Project), source(Comment)] })
const read = (principal: string, requests: ReadonlyArray<Request>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(RemoteRpc)
        return yield* client.FoldkitRemoteRead({ version: REMOTE_PROTOCOL_VERSION, requests })
      }),
    ).pipe(Effect.provide(RemoteRpc.toLayer({ ...RemoteServer.handlers(server, principal) }))),
  )

const page = relationAlias('comments', { first: 1 })
const valuesOf = (result: Awaited<ReturnType<typeof read>>, key: string) =>
  Object.assign(
    {},
    ...result.entities
      .filter(entity => `${entity.entity}:${entity.id}` === key)
      .map(entity => entity.values),
  ) as Record<string, unknown>

beforeEach(() => {
  reads.length = 0
})

describe('a relation read under an alias', () => {
  it('names the alias by the field and the size of the page', () => {
    expect(page).toBe('comments@first=1')
    expect(relationAlias('comments', { last: 3, before: 'c9' })).toBe('comments@last=3')
  })

  it('is read as the relation with its window, in the same read, and answered under the alias', async () => {
    const result = await read('admin', [
      { entity: 'Project', id: 'p1', fields: ['name', page], windows: { [page]: { first: 1 } } },
    ])
    expect(reads).toEqual([
      { entity: 'Project', fields: ['name', 'comments'], windows: { comments: { first: 1 } } },
    ])
    expect(valuesOf(result, 'Project:p1')).toEqual({
      name: 'Apollo',
      [page]: { refs: ['Comment:c1'], hasNext: true, hasPrevious: false },
    })
  })

  it('reads the whole list and a page of it apart, and answers under both names', async () => {
    const result = await read('admin', [
      {
        entity: 'Project',
        id: 'p1',
        fields: ['name', 'comments', page],
        windows: { [page]: { first: 1 } },
      },
    ])
    expect(reads.filter(entry => entry.entity === 'Project')).toEqual([
      { entity: 'Project', fields: ['name', 'comments'], windows: undefined },
      { entity: 'Project', fields: ['comments'], windows: { comments: { first: 1 } } },
    ])
    expect(valuesOf(result, 'Project:p1')).toEqual({
      name: 'Apollo',
      comments: ['Comment:c1', 'Comment:c2'],
      [page]: { refs: ['Comment:c1'], hasNext: true, hasPrevious: false },
    })
  })

  it('follows the relation selected through the alias into the targets of the page only', async () => {
    const result = await read('admin', [
      {
        entity: 'Project',
        id: 'p1',
        fields: [page],
        windows: { [page]: { first: 1 } },
        relations: { [page]: { entity: 'Comment', fields: ['body'] } },
      },
    ])
    expect(result.entities.map(entity => `${entity.entity}:${entity.id}`)).toEqual([
      'Project:p1',
      'Comment:c1',
    ])
  })

  it('is authorized as the field it reads: no alias reaches a field the principal may not read', async () => {
    const result = await read('guest', [
      { entity: 'Project', id: 'p1', fields: ['name', page], windows: { [page]: { first: 1 } } },
    ])
    expect(valuesOf(result, 'Project:p1')).toEqual({ name: 'Apollo' })
    expect(reads.every(entry => !entry.fields.includes('comments'))).toBe(true)
  })

  it('refuses more pages of one relation than a screen would show, at any depth', async () => {
    const pages = [1, 2, 3, 4, 5].map(first => relationAlias('comments', { first }))
    const windows = Object.fromEntries(pages.map((name, index) => [name, { first: index + 1 }]))
    // Each would be a source read of its own, and the client names them.
    await expect(
      read('admin', [{ entity: 'Project', id: 'p1', fields: pages, windows }]),
    ).rejects.toMatchObject({ message: 'Too many pages of "Project.comments" in one read' })
    expect(reads).toEqual([])

    await expect(
      read('admin', [
        {
          entity: 'Comment',
          id: 'c1',
          fields: ['body'],
          relations: { body: { entity: 'Project', fields: pages, windows } },
        },
      ]),
    ).rejects.toMatchObject({ message: 'Too many pages of "Project.comments" in one read' })

    // Four is within what a screen shows.
    const allowed = pages.slice(0, 4)
    const result = await read('admin', [
      {
        entity: 'Project',
        id: 'p1',
        fields: allowed,
        windows: Object.fromEntries(allowed.map((name, index) => [name, { first: index + 1 }])),
      },
    ])
    expect(Object.keys(valuesOf(result, 'Project:p1'))).toEqual(allowed)
  })

  it('asks for nothing when an alias names no window', async () => {
    const result = await read('admin', [{ entity: 'Project', id: 'p1', fields: ['name', page] }])
    expect(valuesOf(result, 'Project:p1')).toEqual({ name: 'Apollo' })
  })
})

describe('a live subscriber to a page', () => {
  it('is sent the page again, under its alias, when the list it reads changes', async () => {
    const entities = [source(Project), source(Comment)]
    const changes = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const fiber = yield* Effect.forkChild(
          Effect.gen(function* () {
            const client = yield* RpcTest.makeClient(RemoteRpc)
            return yield* client
              .FoldkitRemoteLive({
                version: REMOTE_PROTOCOL_VERSION,
                requirements: [
                  {
                    entity: 'Project',
                    id: 'p1',
                    fields: ['comments', page],
                    windows: { [page]: { first: 1 } },
                  },
                ],
                after: 0,
              })
              .pipe(Stream.take(2), Stream.runCollect)
          }).pipe(
            Effect.scoped,
            Effect.provide(
              RemoteRpc.toLayer(RemoteServer.handlers(server, 'admin', { live: hub })),
            ),
          ),
        )
        for (let i = 0; i < 5; i++) yield* Effect.yieldNow
        yield* hub.changed({ entity: 'Project', id: 'p1' }, ['comments'])
        return [...(yield* Fiber.join(fiber))]
      }),
    )
    const patched = changes.flatMap(change =>
      change._tag === 'EntityPatched' ? [change.values] : [],
    )
    expect(patched).toEqual(
      expect.arrayContaining([
        { comments: ['Comment:c1', 'Comment:c2'] },
        { [page]: { refs: ['Comment:c1'], hasNext: true, hasPrevious: false } },
      ]),
    )
  })
})
