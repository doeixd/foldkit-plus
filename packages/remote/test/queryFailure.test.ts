/**
 * What a read shows after its query failed, and what asks again.
 *
 * A `QueryFailed` used to leave nothing behind. A connection that had never
 * loaded read `Initial` — the same as one nobody had asked for — and nothing
 * retried it, because a read entry restarts only when what it plans changes,
 * and the failure changed nothing. `RemoteData` had a `Failed` state with a
 * `previous`, and `RemoteData.render` a `Stale` freshness, and no query ever
 * produced either.
 *
 * The failure is now kept per connection until a page arrives, an
 * invalidation asks again, or retention drops the connection. It is not
 * retried on its own: a persistent error would otherwise be asked again every
 * time an unrelated read restarted the entry.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, RemoteData, entityKey, type RemoteError } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

const ByOwner = Query.define('ByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project], queries: [ByOwner] })

const mine = Data.query(ByOwner, { ownerId: 'u1' }, { select: Summary, first: 25 })
const theirs = Data.query(ByOwner, { ownerId: 'u2' }, { select: Summary, first: 25 })
const initial: Model = { remote: Remote.initial }
const down: RemoteError = { _tag: 'RemoteQueryError', message: 'down' }

const failed = (model: Model, identity = mine.ref.identity): Model =>
  Data.reduce(model, { _tag: 'QueryFailed', connection: identity, error: down })

/** `mine` loaded with `p1`, its row fetched: a `Ready` list of one. */
const loaded = (): Model => {
  const merged = Data.reduce(initial, {
    _tag: 'ConnectionMerged',
    connection: mine.ref.identity,
    page: {
      edges: [{ key: entityKey('Project', 'p1'), ref: { entity: 'Project', id: 'p1' } }],
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
    refreshes: true,
  })
  return Data.reduce(merged, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Project', id: 'p1', fields: ['id', 'name'] }],
    result: { entities: [{ entity: 'Project', id: 'p1', values: { id: 'p1', name: 'One' } }] },
    now: 0,
  })
}

const planned = (model: Model, projection = mine) => Remote.planQueries(Data, model, projection)

describe('A query that failed before anything loaded', () => {
  it('reads Failed with the error, not Initial', () => {
    expect(mine.read(initial)._tag).toBe('Initial')
    expect(mine.read(failed(initial))).toEqual({ _tag: 'Failed', error: down })
  })

  it('shows in the inspection a DevTools panel reads', () => {
    expect(Remote.inspect(failed(initial).remote).failures).toEqual({
      connections: { [mine.ref.identity]: down },
      fields: {},
    })
  })

  it('is not run again on its own', () => {
    expect(planned(initial)).toHaveLength(1)
    expect(planned(failed(initial))).toEqual([])
  })

  it('leaves another connection of the same query alone', () => {
    const model = failed(initial)

    expect(theirs.read(model)._tag).toBe('Initial')
    expect(planned(model, theirs)).toHaveLength(1)
  })
})

describe('A query that failed with rows already on screen', () => {
  it('reads Failed with the rows it had as previous', () => {
    const before = mine.read(loaded())
    expect(before._tag).toBe('Ready')

    expect(mine.read(failed(loaded()))).toEqual({
      _tag: 'Failed',
      error: down,
      previous: (before as { readonly value: unknown }).value,
    })
  })

  it('renders as its rows, marked stale with the error', () => {
    const shown = RemoteData.render(mine.read(failed(loaded())), {
      loading: () => 'loading',
      notFound: () => 'not found',
      failed: () => 'failed',
      data: (page, freshness) =>
        [
          ...page.items.map(item => item.id),
          freshness._tag,
          freshness._tag === 'Stale' ? freshness.error.message : '',
        ].join(' '),
    })

    expect(shown).toBe('p1 Stale down')
  })

  it('still plans the fields of the rows it holds', () => {
    // The rows are on screen, so a field they are missing is still fetched; only
    // the query itself is not run again.
    const unread = failed(
      Data.reduce(initial, {
        _tag: 'ConnectionMerged',
        connection: mine.ref.identity,
        page: {
          edges: [{ key: entityKey('Project', 'p1'), ref: { entity: 'Project', id: 'p1' } }],
          start: { _tag: 'Terminal' },
          end: { _tag: 'Terminal' },
        },
      }),
    )

    expect(planned(unread)).toEqual([])
    expect(Remote.plan(Data, unread, mine)).toEqual([
      { entity: 'Project', id: 'p1', fields: ['id', 'name'] },
    ])
  })
})

describe('What settles a failure', () => {
  it('a page arriving', () => {
    const recovered = Data.reduce(failed(initial), {
      _tag: 'ConnectionMerged',
      connection: mine.ref.identity,
      page: { edges: [], start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
      refreshes: true,
    })

    expect(mine.read(recovered)._tag).toBe('Ready')
    expect(recovered.remote.failures.connections).toEqual({})
  })

  it('Remote.refresh, which asks again even for a list that never loaded', () => {
    const retried = Data.refresh(failed(initial), mine)

    expect(retried.remote.failures.connections).toEqual({})
    expect(planned(retried)).toHaveLength(1)
  })

  it('Remote.refresh over rows on screen, which asks again and keeps them', () => {
    const retried = Data.refresh(failed(loaded()), mine)

    expect(planned(retried)).toHaveLength(1)
    expect(mine.read(retried)._tag).toBe('Refreshing')
  })

  it('a server invalidating the connection', () => {
    const invalidated = Data.reduce(failed(loaded()), {
      _tag: 'LiveReceived',
      stream: 's',
      event: { _tag: 'ConnectionInvalidate', cursor: 1, connection: mine.ref.identity },
      now: 0,
    })

    expect(invalidated.remote.failures.connections).toEqual({})
    expect(planned(invalidated)).toHaveLength(1)
  })

  it('retention dropping the connection, so asking for it later asks the server', () => {
    const released = Data.reduce(failed(initial), {
      _tag: 'RetentionChanged',
      roots: { requirements: [], connections: [] },
    })

    expect(released.remote.failures.connections).toEqual({})
    expect(planned(released)).toHaveLength(1)
  })

  it('but not retention that still names it', () => {
    const kept = Data.reduce(failed(initial), {
      _tag: 'RetentionChanged',
      roots: { requirements: [], connections: [{ identity: mine.ref.identity }] },
    })

    expect(mine.read(kept)).toEqual({ _tag: 'Failed', error: down })
  })
})
