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
 * **What that does and does not buy.** The edges are rejected, which is the
 * point — they never reach the store or the connection. But a `QueryFailed` for
 * a connection the Model never held is a deliberate no-op ("one the Model never
 * held stays absent"), so a view reading it still sees `Initial` rather than
 * `Failed`. That is pre-existing and applies to every query failure equally, not
 * something this check introduces; whether a failed query should be visible to a
 * read at all is a separate question, recorded in the design doc rather than
 * changed here.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, RemoteClient } from '../src/index.js'

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

/** The Message the fetch Command yields for a window of `first`, given a server. */
const fetched = (first: number, returns: number) =>
  Effect.runPromise(
    Data.fetch(projects(first).ref).effect.pipe(Effect.provide(serverReturning(returns))) as never,
  ) as Promise<{ readonly _tag: string; readonly error?: { readonly message: string } }>

describe('A page within its window', () => {
  it('merges, as every page always has', async () => {
    const message = await fetched(25, 25)

    expect(message._tag).toBe('ConnectionMerged')
  })

  it('merges when the server returns fewer than were asked for', async () => {
    // Fewer is ordinary: it is the last page.
    const message = await fetched(25, 3)

    expect(message._tag).toBe('ConnectionMerged')
  })
})

describe('A page that overruns its window', () => {
  it('fails rather than merging', async () => {
    const message = await fetched(25, 26)

    expect(message._tag).toBe('QueryFailed')
  })

  it('names both numbers, so the disagreement can be diagnosed', async () => {
    const message = await fetched(25, 1000)

    expect(message.error?.message).toBe('the server returned 1000 edges for a window of 25')
  })

  it('keeps the rows out of the Model, which is the point of refusing them', async () => {
    const projection = projects(2)
    const model = Data.reduce(initial, (await fetched(2, 5)) as never)

    expect(Remote.inspect(model.remote).connections).toEqual([])
    expect(Remote.inspect(model.remote).entities).toEqual([])
    expect(projection.read(model)._tag).toBe('Initial')
  })

  it('leaves a connection it already held exactly as it was', async () => {
    // A refresh that overruns must not replace good rows with a rejected page.
    const projection = projects(2)
    const loaded = Data.reduce(initial, (await fetched(2, 2)) as never)
    const after = Data.reduce(loaded, (await fetched(2, 9)) as never)

    expect(Remote.inspect(after.remote).connections).toEqual(
      Remote.inspect(loaded.remote).connections,
    )
    expect(projection.read(after)._tag).toBe(projection.read(loaded)._tag)
  })

  it('bounds a backward window by `last`, not only a forward one by `first`', async () => {
    const backward = Query.last(2)(ProjectsByOwner.ref({ ownerId: 'u1' }))
    const message = (await Effect.runPromise(
      Data.fetch(backward).effect.pipe(Effect.provide(serverReturning(9))) as never,
    )) as { readonly _tag: string; readonly error?: { readonly message: string } }

    expect(message._tag).toBe('QueryFailed')
    expect(message.error?.message).toContain('window of 2')
  })

  it('bounds nothing when no size was asked for', async () => {
    // `after`/`before` with no `first`/`last` says where to start, not how much
    // to take, so any number of edges is within it.
    const unbounded = Query.after('c1')(ProjectsByOwner.ref({ ownerId: 'u1' }))
    const message = (await Effect.runPromise(
      Data.fetch(unbounded).effect.pipe(Effect.provide(serverReturning(500))) as never,
    )) as { readonly _tag: string }

    expect(message._tag).toBe('ConnectionMerged')
  })
})
