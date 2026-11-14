/**
 * `policies` on `Data.wiring` (#236): two Surfaces active on one route read
 * under two policies, by their keys in the active record, and an entry it
 * does not name reads under `policy`. Read from the wiring's own
 * Subscriptions, as an assembly runs them.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, RemotePolicy, type RemoteMessage } from '../src/index.js'

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

/** A domain of its own per test: a domain remembers every wiring's readers and their policies. */
const domain = () =>
  Remote.make({ model: App.model.remote, entities: [Project], queries: [ByOwner] })

const listOf = (ownerId: string) =>
  domain().query(ByOwner, { ownerId }, { select: Summary, first: 25 })
const mine = listOf('u1')
const theirs = listOf('u2')

const terminal = { _tag: 'Terminal' } as const
const fields = ['id', 'name', 'ownerId']

/** `list` answered at `now` with one row owned by `ownerId`. */
const answered = (list: typeof mine, ownerId: string, now: number): RemoteMessage => ({
  _tag: 'ConnectionMerged',
  connection: list.ref.identity,
  page: {
    edges: [{ key: `Project:${ownerId}`, ref: { entity: 'Project', id: ownerId } }],
    start: terminal,
    end: terminal,
  },
  refreshes: true,
  select: { entity: 'Project', fields },
  entities: [{ entity: 'Project', id: ownerId, values: { id: ownerId, name: 'P', ownerId } }],
  now,
})

const start: Model = { remote: Remote.initial }
const reduceAll = (Data: ReturnType<typeof domain>, messages: ReadonlyArray<RemoteMessage>) =>
  messages.reduce(Data.reduce, start)

const grid = RemotePolicy.staleWhileRevalidate({ maxAge: 1_000 })
const feed = RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 })

/** Two Surfaces active on one route, `grid` reading `mine` and `feed` reading `theirs`. */
const activesOf = (Data: ReturnType<typeof domain>, feedList = theirs) => ({
  grid: Data.active('grid', () => Option.some(mine)),
  feed: Data.active('feed', () => Option.some(feedList)),
})

describe('Data.wiring with policies', () => {
  it('reads each Surface active on a route under its own policy', () => {
    const Data = domain()
    const wiring = Data.wiring(activesOf(Data), { policy: feed, policies: { grid }, now: () => 0 })
    const loaded = reduceAll(Data, [answered(mine, 'u1', 0), answered(theirs, 'u2', 0)])

    const expiry = (key: string) =>
      wiring.subscriptions[`${key}.read`]!.modelToDependencies(loaded).expires?.at

    expect(expiry('grid')).toBe(1_000)
    expect(expiry('feed')).toBe(60_000)
  })

  it('plans an entry it names under its policy, and the rest under policy', () => {
    const Data = domain()
    const wiring = Data.wiring(activesOf(Data), {
      policy: RemotePolicy.cacheFirst,
      policies: { feed: RemotePolicy.cacheOnly },
    })
    const queried = (key: string) =>
      wiring.subscriptions[`${key}.read`]!.modelToDependencies(start).queries.map(
        (query: { identity: string }) => query.identity,
      )

    expect(queried('grid')).toEqual([mine.ref.identity])
    expect(queried('feed')).toEqual([])
  })

  it('picks an entry’s policy from the Model when it is a function', () => {
    const Data = domain()
    const wiring = Data.wiring(activesOf(Data), {
      policies: { feed: (model: Model) => (model.remote === start.remote ? grid : feed) },
      now: () => 0,
    })
    const loaded = reduceAll(Data, [answered(theirs, 'u2', 0)])

    expect(wiring.subscriptions['feed.read']!.modelToDependencies(loaded).expires?.at).toBe(60_000)
  })

  it('reads an entry it does not name under the default when no policy is given', () => {
    const Data = domain()
    const wiring = Data.wiring(activesOf(Data), { policies: { grid }, now: () => 0 })
    const loaded = reduceAll(Data, [answered(theirs, 'u2', 0)])

    expect(wiring.subscriptions['feed.read']!.modelToDependencies(loaded).expires).toBeNull()
  })

  it('reads a key Object.prototype holds under policy, not under what the prototype answers', () => {
    const Data = domain()
    const wiring = Data.wiring(
      { constructor: Data.active('grid', () => Option.some(mine)) },
      { policy: grid, policies: {}, now: () => 0 },
    )
    const loaded = reduceAll(Data, [answered(mine, 'u1', 0)])

    expect(wiring.subscriptions['constructor.read']!.modelToDependencies(loaded).expires?.at).toBe(
      1_000,
    )
  })

  it('refuses a key the active record does not hold, where it is given', () => {
    const Data = domain()
    const actives: Readonly<Record<string, ReturnType<typeof Data.active>>> = activesOf(Data)

    expect(() => Data.wiring(actives, { policies: { gird: grid } })).toThrow(
      'policies names "gird", which the active record does not hold; its keys are grid, feed',
    )
  })
})

describe('A list two entries read, under policies', () => {
  // Both entries read `mine`; the retain root says whether the list keeps its
  // age once left (`234-352-cache-DESIGN.md`).
  const rootOf = (options: Parameters<ReturnType<typeof domain>['wiring']>[1]) => {
    const Data = domain()
    const wiring = Data.wiring(activesOf(Data, mine), options)
    return wiring.subscriptions.retain!.modelToDependencies(start).connections
  }

  it('ages when both entries age it', () => {
    expect(rootOf({ policy: feed, policies: { grid } })).toMatchObject([
      { identity: mine.ref.identity, ages: true },
    ])
  })

  it('is held stale when only one entry ages it', () => {
    expect(rootOf({ policy: RemotePolicy.cacheFirst, policies: { grid } })[0]).not.toHaveProperty(
      'ages',
    )
    expect(
      rootOf({ policy: grid, policies: { feed: RemotePolicy.cacheFirst } })[0],
    ).not.toHaveProperty('ages')
  })
})
