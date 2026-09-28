/**
 * A page larger than the window it was asked for.
 *
 * local-execution-DESIGN §17.1. The client asks `first: 25`; nothing used to
 * check what came back, and `merge` accepted whatever arrived. In a normal
 * deployment the server is yours and this never happens — but this is a library
 * with a versioned wire protocol, and a server paginating wrongly is at least
 * as likely as a hostile one. A `first: 25` that quietly becomes a thousand is
 * a memory event with no error attached to it.
 *
 * It fails the way any query fails: a `QueryFailed` Message carrying a named
 * protocol error, rather than an exception escaping a subscription.
 *
 * The edges are rejected, which is the point — they never reach the store or
 * the connection. What does reach the Model is the failure, so a view reading
 * the connection sees `Failed` with the protocol error rather than `Initial`.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, RemoteClient, type RemoteMessage } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const ProjectSummary = DomainEntity.select(Project, { id: true, name: true })

const ProjectsByOwner = Query.define('ProjectsByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})

const initial: Model = { remote: Remote.initial }
const projects = (first: number) =>
  Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, first })

/** A server that answers every query with `count` edges, whatever was asked. */
const serverReturning = (count: number) =>
  Layer.succeed(RemoteClient, {
    read: () => Effect.succeed({ entities: [] }),
    query: () =>
      Effect.succeed({
        edges: Array.from({ length: count }, (_, n) => ({
          key: `Project:p${n}`,
          entity: 'Project',
          id: `p${n}`,
        })),
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
      }),
    mutate: () => Effect.die('not used'),
    live: () => Stream.empty,
  } as never)

/**
 * The Message that settles the list's query when the read entry runs it from
 * `model`, against a server that returns `returns` edges.
 */
const fetched = async (
  projection: ReturnType<typeof projects>,
  returns: number,
  model: Model = initial,
): Promise<RemoteMessage> => {
  const entry = Data.subscriptions({
    list: Data.active('List', () => Option.some(projection)),
  })['list.read']
  const messages = await Effect.runPromise(
    Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(model))).pipe(
      Effect.provide(serverReturning(returns)),
    ),
  )
  const settled = [...messages].find(
    message => message._tag === 'ConnectionMerged' || message._tag === 'QueryFailed',
  )
  if (settled === undefined) throw new Error('the read entry ran no query')
  return settled
}
const errorOf = (message: RemoteMessage) =>
  message._tag === 'QueryFailed' ? message.error.message : undefined

describe('A page within its window', () => {
  it('merges, as every page always has', async () => {
    const message = await fetched(projects(25), 25)

    expect(message._tag).toBe('ConnectionMerged')
  })

  it('merges when the server returns fewer than were asked for', async () => {
    // Fewer is ordinary: it is the last page.
    const message = await fetched(projects(25), 3)

    expect(message._tag).toBe('ConnectionMerged')
  })
})

describe('A page that overruns its window', () => {
  it('fails rather than merging', async () => {
    const message = await fetched(projects(25), 26)

    expect(message._tag).toBe('QueryFailed')
  })

  it('names both numbers, so the disagreement can be diagnosed', async () => {
    const message = await fetched(projects(25), 1000)

    expect(errorOf(message)).toBe('the server returned 1000 edges for a window of 25')
  })

  it('keeps the rows out of the Model, which is the point of refusing them', async () => {
    const projection = projects(2)
    const model = Data.reduce(initial, await fetched(projection, 5))

    expect(Remote.inspect(model.remote).connections).toEqual([])
    expect(Remote.inspect(model.remote).entities).toEqual([])
    expect(projection.read(model)).toEqual({
      _tag: 'Failed',
      error: {
        _tag: 'RemoteProtocolError',
        message: 'the server returned 5 edges for a window of 2',
      },
    })
  })

  it('leaves a connection it already held exactly as it was', async () => {
    // A refresh that overruns must not replace good rows with a rejected page.
    const projection = projects(2)
    const loaded = Data.reduce(initial, await fetched(projection, 2))
    const refreshed = Data.refresh(loaded, projection)
    const after = Data.reduce(refreshed, await fetched(projection, 9, refreshed))

    expect(Remote.inspect(after.remote).connections).toEqual(
      Remote.inspect(loaded.remote).connections,
    )
    // The rows stay; what changes is that a read now says the refresh failed.
    expect(projection.read(after)._tag).toBe('Failed')
  })

  it('bounds a backward window by `last`, not only a forward one by `first`', async () => {
    const backward = Data.query(
      ProjectsByOwner,
      { ownerId: 'u1' },
      { select: ProjectSummary, last: 2 },
    )
    const message = await fetched(backward, 9)

    expect(message._tag).toBe('QueryFailed')
    expect(errorOf(message)).toContain('window of 2')
  })

  it('bounds nothing when no size was asked for', async () => {
    // `after`/`before` with no `first`/`last` says where to start, not how much
    // to take, so any number of edges is within it.
    const unbounded = Data.query(
      ProjectsByOwner,
      { ownerId: 'u1' },
      { select: ProjectSummary, after: 'c1' },
    )
    const message = await fetched(unbounded, 500)

    expect(message._tag).toBe('ConnectionMerged')
  })
})
