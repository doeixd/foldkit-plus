/**
 * `Loading` for a list whose first page is on its way.
 *
 * `Initial` is documented as "nothing is fetching this", and it is the state
 * that points at a wiring mistake: a Projection no active Surface observes. A
 * list whose first query was in flight read `Initial` too, because entity
 * reads had in-flight marks and queries had none, so a view could not tell a
 * slow network from a Surface that was never activated.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, RemoteClient, entityKey } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)

const All = Query.define('All', { owner: Schema.String }, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project], queries: [All] })

const select = DomainEntity.select(Project, { name: true })
const mine = Data.query(All, { owner: 'u1' }, { select, first: 25 })
const theirs = Data.query(All, { owner: 'u2' }, { select, first: 25 })
const initial: Model = { remote: Remote.initial }

const started = (model: Model, identity = mine.ref.identity): Model =>
  Data.reduce(model, { _tag: 'QueryStarted', connections: [identity] })

const page = (model: Model): Model =>
  Data.reduce(model, {
    _tag: 'ConnectionMerged',
    connection: mine.ref.identity,
    page: { edges: [], start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
    refreshes: true,
  })

describe('A list whose first page is on its way', () => {
  it('reads Loading, not Initial', () => {
    expect(mine.read(initial)._tag).toBe('Initial')
    expect(mine.read(started(initial))._tag).toBe('Loading')
  })

  it('leaves another list of the same query Initial', () => {
    expect(theirs.read(started(initial))._tag).toBe('Initial')
  })

  it('reads Ready once the page lands, with nothing left in flight', () => {
    const landed = page(started(initial))

    expect(mine.read(landed)._tag).toBe('Ready')
    expect(Remote.inspect(landed.remote).loading).toEqual([])
  })

  it('reads Failed once the query fails, not Loading', () => {
    const failed = Data.reduce(started(initial), {
      _tag: 'QueryFailed',
      connection: mine.ref.identity,
      error: { _tag: 'RemoteQueryError', message: 'down' },
    })

    expect(mine.read(failed)._tag).toBe('Failed')
    expect(Remote.inspect(failed.remote).loading).toEqual([])
  })

  it('reads Loading while a retry of a list that never loaded is in flight', () => {
    const failed = Data.reduce(initial, {
      _tag: 'QueryFailed',
      connection: mine.ref.identity,
      error: { _tag: 'RemoteQueryError', message: 'down' },
    })

    expect(mine.read(started(Data.refresh(failed, mine)))._tag).toBe('Loading')
  })

  it('does not hide the rows of a list that already has some', () => {
    const loaded = Data.reduce(
      Data.reduce(initial, {
        _tag: 'ConnectionMerged',
        connection: mine.ref.identity,
        page: {
          edges: [{ key: entityKey('Project', 'p1'), ref: { entity: 'Project', id: 'p1' } }],
          start: { _tag: 'Terminal' },
          end: { _tag: 'Terminal' },
        },
        refreshes: true,
      }),
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
        result: { entities: [{ entity: 'Project', id: 'p1', values: { name: 'One' } }] },
        now: 0,
      },
    )

    expect(mine.read(started(Data.refresh(loaded, mine)))._tag).toBe('Refreshing')
  })
})

describe('A query the entry stopped waiting for', () => {
  it('is forgotten when retention drops the list, so it cannot read Loading forever', () => {
    const released = Data.reduce(started(initial), {
      _tag: 'RetentionChanged',
      roots: { requirements: [], connections: [] },
    })

    expect(mine.read(released)._tag).toBe('Initial')
  })

  it('is kept while retention still names the list', () => {
    const kept = Data.reduce(started(initial), {
      _tag: 'RetentionChanged',
      roots: { requirements: [], connections: [{ identity: mine.ref.identity }] },
    })

    expect(mine.read(kept)._tag).toBe('Loading')
  })
})

describe('The read entry', () => {
  it('says a query started before it sends it', async () => {
    const List = App.surface('List', { model: () => ({ mine }) })
    const entry = Data.subscriptions({ list: List })['list.read']
    const client = Layer.succeed(RemoteClient, {
      read: () => Effect.die('unused'),
      query: () => Effect.never,
      mutate: () => Effect.die('unused'),
      live: () => Stream.empty,
    })

    const [first] = await Effect.runPromise(
      Stream.runCollect(
        Stream.take(entry.dependenciesToStream(entry.modelToDependencies(initial)), 1),
      ).pipe(Effect.provide(client)),
    )

    expect(mine.read(Data.reduce(initial, first as never))._tag).toBe('Loading')
  })
})
