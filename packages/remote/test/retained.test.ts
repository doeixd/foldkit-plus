/**
 * A connection that survives a reload.
 *
 * local-execution-DESIGN phase 6 / §5.1. Remote's cache is deliberately
 * "server-derived and disposable", which is right for a cache and wrong for the
 * thing a user notices: a list going blank on reload while a request they
 * already made once is made again.
 *
 * So a connection can be **declared** to survive, and nothing survives that was
 * not. Two properties of a restored one are the whole design:
 *
 * - It comes back with **unknown** boundaries. Not `Terminal`, which would
 *   claim there is nothing more; not the cursors it had, which name server
 *   state that may be gone. The snapshot has nowhere to put a cursor, so that
 *   cannot be got wrong later.
 * - It comes back **stale**, so the rows show at once and the connection is
 *   refetched. Stale-then-refreshed rather than blank-then-loaded.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, RemotePersistence, initialRemoteModel, updateRemote } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

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

const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: Summary, first: 25 })
const identity = projects.ref.identity

/** A session that loaded one page of two projects, with a cursor at its end. */
const session = (): Model => {
  const merged = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: {
        edges: [
          { key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } },
          { key: 'Project:p2', ref: { entity: 'Project', id: 'p2' } },
        ],
        start: { _tag: 'Terminal' },
        // More to come: the cursor is the thing a snapshot must not keep.
        end: { _tag: 'Cursor', cursor: 'c2' },
      },
    },
  )
  return Data.reduce(merged, {
    _tag: 'ReadReceived',
    requests: [
      { entity: 'Project', id: 'p1', fields: ['id', 'name'] },
      { entity: 'Project', id: 'p2', fields: ['id', 'name'] },
    ],
    result: {
      entities: [
        { entity: 'Project', id: 'p1', values: { id: 'p1', name: 'Apollo' } },
        { entity: 'Project', id: 'p2', values: { id: 'p2', name: 'Borealis' } },
      ],
    },
    now: 0,
  })
}

/** Reload: a snapshot out of one Model and into a fresh one. */
const reload = (from: Model, declared: ReadonlyArray<string>): Model => {
  const snapshot = RemotePersistence.snapshotOf(from.remote, { connections: declared })
  const text = RemotePersistence.dehydrate(snapshot)
  const restored = RemotePersistence.hydrate(text)!
  return {
    remote: updateRemote(initialRemoteModel, {
      _tag: 'Hydrated',
      entities: restored.entities,
      connections: restored.connections,
      merge: 'replace',
    }),
  }
}

describe('A declared connection comes back', () => {
  it('shows its rows at once rather than going blank', () => {
    const after = reload(session(), [identity])

    expect(after.remote.connections[identity]).toBeDefined()
    expect(projects.read(after)).toMatchObject({
      value: {
        items: [
          { id: 'p1', name: 'Apollo' },
          { id: 'p2', name: 'Borealis' },
        ],
      },
    })
  })

  it('reads as Refreshing, so what is shown is not claimed to be current', () => {
    expect(projects.read(reload(session(), [identity]))._tag).toBe('Refreshing')
  })

  it('is refetched, which is the other half of stale-then-refreshed', () => {
    const after = reload(session(), [identity])

    expect(Remote.planQueries(Data, after, projects).map(ref => ref.identity)).toEqual([identity])
  })

  it('keeps no cursor, because a cursor may name server state that is gone', () => {
    const after = reload(session(), [identity])
    const [segment] = after.remote.connections[identity]!.segments

    expect(segment!.start).toEqual({ _tag: 'Unknown' })
    expect(segment!.end).toEqual({ _tag: 'Unknown' })
    // The session it came from had one, so this is a loss on purpose.
    expect(session().remote.connections[identity]!.segments[0]!.end).toEqual({
      _tag: 'Cursor',
      cursor: 'c2',
    })
  })

  it('claims completeness in neither direction, because it no longer knows', () => {
    // `hasNext`/`hasPrevious` are derived from boundaries, and `Unknown` is not
    // `Terminal` — so both are true. The session knew it was at the start;
    // the restored one does not, and says so rather than guessing.
    const before = projects.read(session())
    const after = projects.read(reload(session(), [identity]))

    expect(before).toMatchObject({ value: { hasPrevious: false, hasNext: true } })
    expect(after).toMatchObject({ value: { hasPrevious: true, hasNext: true } })
    expect(after._tag).toBe('Refreshing')
  })
})

describe('Nothing survives that was not declared', () => {
  it('keeps no connection by default, which is what a cache always did', () => {
    const after = reload(session(), [])

    expect(after.remote.connections).toEqual({})
    expect(projects.read(after)._tag).toBe('Initial')
  })

  it('keeps the entities regardless, since those were always the cache', () => {
    const after = reload(session(), [])

    expect(
      Remote.inspect(after.remote)
        .entities.map(entry => entry.key)
        .sort(),
    ).toEqual(['Project:p1', 'Project:p2'])
  })

  it('ignores a declared connection the Model does not hold', () => {
    const after = reload(session(), ['NoSuchQuery\u0000{}'])

    expect(after.remote.connections).toEqual({})
  })
})

describe('A snapshot that cannot be trusted still degrades to a refetch', () => {
  it('refuses one whose connection edges are malformed', () => {
    const text = RemotePersistence.dehydrate(
      RemotePersistence.snapshotOf(session().remote, { connections: [identity] }),
    )
    const corrupt = text.replace('"ref"', '"nope"')

    expect(RemotePersistence.hydrate(corrupt)).toBeUndefined()
  })

  it('refuses one from an older cache version', () => {
    const text = RemotePersistence.dehydrate(
      RemotePersistence.snapshotOf(session().remote, { connections: [identity] }),
    )

    expect(RemotePersistence.hydrate(text.replace('"version":4', '"version":3'))).toBeUndefined()
  })
})
