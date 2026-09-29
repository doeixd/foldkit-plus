/**
 * Query payload planning: one server response populates the connection and
 * the selected entity fields, so a fresh query lands Ready without a second
 * round trip. `Data.meta` reports when what is shown was received.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Query, Remote, RemoteClient, RemoteQueryError } from '../src/index.js'

const Post = Entity.make(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    excerpt: Schema.String,
  }),
)
const PostsQuery = Query.make('Posts', {
  Input: {},
  Result: Query.connection(Post),
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Post], queries: [PostsQuery] })
const initial: Model = { remote: Remote.initial }

const summary = Post.select({ id: true, title: true, excerpt: true })

describe('query payload', () => {
  it('sends the selection with the query', async () => {
    const seen: Array<unknown> = []
    const client = Layer.succeed(RemoteClient, {
      read: () => Effect.die('read must not run when the payload carries fields'),
      query: request =>
        Effect.sync(() => {
          seen.push(request)
          return {
            edges: [{ entity: 'Post', id: 'p1', key: 'Post:p1' }],
            start: { _tag: 'Terminal' as const },
            end: { _tag: 'Terminal' as const },
            entities: [
              { entity: 'Post', id: 'p1', values: { id: 'p1', title: 'T', excerpt: 'E' } },
            ],
            settled: [],
          }
        }),
      mutate: () => Effect.die('unused'),
      live: () => Stream.empty,
    })
    const projects = Data.query(PostsQuery, {}, { select: summary, first: 10 })
    const loaded = await Effect.runPromise(
      Data.prefetch(initial, projects).pipe(Effect.provide(client)),
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      query: 'Posts',
      select: { entity: 'Post', fields: ['id', 'title', 'excerpt'] },
    })
    // One response populated both: no second read, and the list is Ready.
    expect(projects.read(loaded)).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ id: 'p1', title: 'T' }] },
    })
    expect(Data.plan(loaded, projects)).toEqual([])
  })

  it('falls back to a second read when the server sends edges only', async () => {
    const queries: Array<unknown> = []
    const reads: Array<unknown> = []
    const client = Layer.succeed(RemoteClient, {
      read: batch =>
        Effect.sync(() => {
          reads.push(batch.requests.map(request => request.id))
          return {
            settled: [],
            entities: batch.requests.map(request => ({
              entity: request.entity,
              id: request.id,
              values: { id: request.id, title: 'T', excerpt: 'E' },
            })),
          }
        }),
      query: request =>
        Effect.sync(() => {
          queries.push(request)
          return {
            edges: [{ entity: 'Post', id: 'p1', key: 'Post:p1' }],
            start: { _tag: 'Terminal' as const },
            end: { _tag: 'Terminal' as const },
          }
        }),
      mutate: () => Effect.die('unused'),
      live: () => Stream.empty,
    })
    const projects = Data.query(PostsQuery, {}, { select: summary })
    const loaded = await Effect.runPromise(
      Data.prefetch(initial, projects).pipe(Effect.provide(client)),
    )
    expect(queries).toHaveLength(1)
    expect(reads).toEqual([['p1']])
    expect(projects.read(loaded)._tag).toBe('Ready')
  })

  it('Remote.query sends select and queryMessage merges the payload', async () => {
    const ref = PostsQuery.ref({})
    const result = {
      edges: [{ entity: 'Post', id: 'p1', key: 'Post:p1' }],
      start: { _tag: 'Terminal' as const },
      end: { _tag: 'Terminal' as const },
      entities: [{ entity: 'Post', id: 'p1', values: { id: 'p1', title: 'T', excerpt: 'E' } }],
      settled: [],
    }
    const message = Remote.queryMessage(ref, result, {
      entity: 'Post',
      fields: ['id', 'title', 'excerpt'],
    })
    expect(message._tag).toBe('ConnectionMerged')
    if (message._tag !== 'ConnectionMerged') return
    expect(message.entities).toHaveLength(1)
    const merged = Data.reduce(initial, message)
    const projects = Data.query(PostsQuery, {}, { select: summary })
    expect(projects.read(merged)._tag).toBe('Ready')
    // Without select the payload has nowhere to write, so it merges edges only.
    const bare = Remote.queryMessage(ref, {
      edges: result.edges,
      start: result.start,
      end: result.end,
    })
    expect(bare._tag).toBe('ConnectionMerged')
    if (bare._tag !== 'ConnectionMerged') return
    expect(bare.entities).toBeUndefined()
  })

  it('a query that fails encoding still fails as a query', async () => {
    const BadInput = Query.make('BadInput', {
      Input: Schema.Struct({ n: Schema.Number }),
      Result: Query.connection(Post),
    })
    const ref = BadInput.ref({ n: 1 })
    const client = Layer.succeed(RemoteClient, {
      read: () => Effect.die('unused'),
      query: () => Effect.fail(new RemoteQueryError({ message: 'unreachable' })),
      mutate: () => Effect.die('unused'),
      live: () => Stream.empty,
    })
    const result = await Effect.runPromise(
      Effect.result(Remote.query(ref).pipe(Effect.provide(client))),
    )
    expect(result._tag).toBe('Failure')
  })

  it('a settled-only payload still settles, with nothing to write', () => {
    const projects = Data.query(PostsQuery, {}, { select: summary })
    const merged = Data.reduce(
      initial,
      Remote.queryMessage(
        projects.ref,
        {
          edges: [{ entity: 'Post', id: 'p1', key: 'Post:p1' }],
          start: { _tag: 'Terminal' as const },
          end: { _tag: 'Terminal' as const },
          entities: [],
          settled: [{ entity: 'Post', id: 'p1', fields: ['excerpt'] }],
        },
        { entity: 'Post', fields: ['id', 'title', 'excerpt'] },
        7,
      ),
    )
    // Withheld: not planned again, and reads as unavailable rather than missing.
    const excerpt = Data.get(Post.select({ excerpt: true }), 'p1')
    expect(Data.plan(merged, excerpt)).toEqual([])
    expect(excerpt.read(merged)).toMatchObject({
      _tag: 'Failed',
      error: { _tag: 'Unavailable' },
    })
  })

  it('entities without a select are unsolicited and ignored', () => {
    const projects = Data.query(PostsQuery, {}, { select: summary })
    const failed = Data.reduce(initial, {
      _tag: 'ReadFailed',
      requests: [{ entity: 'Post', id: 'p1', fields: ['title'] }],
      error: { _tag: 'RemoteReadError', message: 'boom' },
    })
    const merged = Data.reduce(failed, {
      _tag: 'ConnectionMerged',
      connection: projects.ref.identity,
      page: {
        edges: [{ key: 'Post:p1', ref: { entity: 'Post', id: 'p1' } }],
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
      },
      entities: [{ entity: 'Post', id: 'p1', values: { id: 'p1', title: 'T', excerpt: 'E' } }],
      settled: [],
    })
    // Nowhere to write them: the failure survives (the read stays Failed
    // with it) and the fields are still planned minus the failed one.
    expect(projects.read(merged)).toEqual({
      _tag: 'Failed',
      error: { _tag: 'RemoteReadError', message: 'boom' },
    })
    expect(Data.plan(merged, projects)).toEqual([
      { entity: 'Post', id: 'p1', fields: ['id', 'excerpt'] },
    ])
    expect(Object.keys(Data.inspect(merged).failures.fields)).toContain('Post:p1\u0000title')
  })
})

describe('Data.meta', () => {
  it('is empty before anything loads, dated once the payload lands', async () => {
    const projects = Data.query(PostsQuery, {}, { select: summary })
    expect(Data.meta(initial, projects)).toEqual({
      updatedAt: undefined,
      stale: false,
      loading: false,
    })
    const at = 1_700_000_000_000
    const merged = Data.reduce(
      initial,
      Remote.queryMessage(
        projects.ref,
        {
          edges: [{ entity: 'Post', id: 'p1', key: 'Post:p1' }],
          start: { _tag: 'Terminal' as const },
          end: { _tag: 'Terminal' as const },
          entities: [{ entity: 'Post', id: 'p1', values: { id: 'p1', title: 'T', excerpt: 'E' } }],
          settled: [],
        },
        { entity: 'Post', fields: ['id', 'title', 'excerpt'] },
        at,
      ),
    )
    expect(Data.meta(merged, projects)).toEqual({ updatedAt: at, stale: false, loading: false })
    const detail = Data.get(Post.select({ title: true }), 'p1')
    expect(Data.meta(merged, detail)).toEqual({ updatedAt: at, stale: false, loading: false })
  })

  it('reports stale after refresh and loading while in flight', () => {
    const at = 1000
    const merged = Data.reduce(
      initial,
      Remote.queryMessage(
        PostsQuery.ref({}),
        {
          edges: [{ entity: 'Post', id: 'p1', key: 'Post:p1' }],
          start: { _tag: 'Terminal' as const },
          end: { _tag: 'Terminal' as const },
          entities: [{ entity: 'Post', id: 'p1', values: { id: 'p1', title: 'T', excerpt: 'E' } }],
          settled: [],
        },
        { entity: 'Post', fields: ['id', 'title', 'excerpt'] },
        at,
      ),
    )
    const projects = Data.query(PostsQuery, {}, { select: summary })
    const refreshed = Data.refresh(merged, projects)
    expect(Data.meta(refreshed, projects).stale).toBe(true)
    const started = Data.reduce(refreshed, {
      _tag: 'QueryStarted',
      connections: [projects.ref.identity],
    })
    expect(Data.meta(started, projects)).toMatchObject({ stale: true, loading: true })
  })
})
