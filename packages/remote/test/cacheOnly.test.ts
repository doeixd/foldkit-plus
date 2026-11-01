/**
 * `RemotePolicy.cacheOnly` (#402): a read that asks for nothing. It shows what
 * the store holds, keeps following what changes the store, and reads
 * `Initial` for what the store lacks, which `why` says the policy left
 * unasked. A screen that works offline picks it from its Model, and going
 * back online asks for what it left missing.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Query,
  Remote,
  RemotePolicy,
  RemoteClient,
  isRemoteMessage,
  type RemoteMessage,
} from '../src/index.js'
import { live } from '../src/live.js'
import { Respond, Trace } from '../src/testing.js'
import { why, Why } from '../src/why.js'

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

const Model = Schema.Struct({ remote: Remote.Model, online: Schema.Boolean })
type Model = typeof Model.Type
const own = { WentOnline: { online: Schema.Boolean } }
const Message = defineMessageUnion({ ...Remote.messages, ...own })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})

const one = Data.get(Summary, 'p1')
const other = Data.get(Summary, 'p2')
// A live event reaches a domain that reads a row live.
live(Data, Summary, 'p2')
const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: Summary, first: 25 })

const Own = defineMessageUnion(own)
const update = (model: Model, message: Message): Update.Return<Model, Message> => {
  if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
  return Own.match(message, {
    WentOnline: ({ online }) => ({ model: modifyFields(model, { online: () => online }) }),
  })
}

const active = {
  one: Data.active('one', () => Option.some(one)),
  other: Data.active('other', () => Option.some(other)),
  projects: Data.active('projects', () => Option.some(projects)),
}
const policy = (model: Model) => (model.online ? RemotePolicy.networkOnly : RemotePolicy.cacheOnly)

const row = (id: string): Readonly<Record<string, string>> => ({
  id,
  name: `Project ${id}`,
  ownerId: 'u1',
})

/** A server answering every read and query, counting the requests and what they asked. */
const server = () => {
  const asked: Array<string> = []
  const client: RemoteClient['Service'] = {
    read: request => {
      asked.push(...request.requests.map(each => `read ${each.entity}:${each.id}`))
      return Effect.succeed({
        entities: request.requests.map(each => ({
          entity: each.entity,
          id: each.id,
          values: Object.fromEntries(each.fields.map(field => [field, row(each.id)[field]])),
        })),
        settled: [],
      })
    },
    query: request => {
      asked.push(`query ${request.query}`)
      return Effect.succeed({
        edges: [{ entity: 'Project', id: 'p1', key: 'Project:p1' }],
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
        entities: [
          {
            entity: 'Project',
            id: 'p1',
            values: Object.fromEntries(
              (request.select?.fields ?? []).map(field => [field, row('p1')[field]]),
            ),
          },
        ],
      })
    },
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  }
  return { client, asked }
}

const received = (ids: ReadonlyArray<string>, name = (id: string) => `Project ${id}`) =>
  ({
    _tag: 'ReadReceived',
    requests: ids.map(id => ({ entity: 'Project', id, fields: ['id', 'name'] })),
    result: {
      settled: [],
      entities: ids.map(id => ({ entity: 'Project', id, values: { id, name: name(id) } })),
    },
    now: 0,
  }) satisfies RemoteMessage

const listed: RemoteMessage = {
  _tag: 'ConnectionMerged',
  connection: projects.ref.identity,
  page: {
    edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
    start: { _tag: 'Terminal' },
    end: { _tag: 'Terminal' },
  },
  refreshes: true,
  // A list's rows carry what its body reads, so the client can place a row.
  select: { entity: 'Project', fields: ['id', 'name', 'ownerId'] },
  entities: [{ entity: 'Project', id: 'p1', values: row('p1') }],
}

const offline: Model = { remote: Remote.initial, online: false }
/** Offline, holding p1 and the list, and not p2. */
const holding: Model = [received(['p1']), listed].reduce(Data.reduce, offline)

const run = (
  start: Model,
  steps: ReadonlyArray<Message | Respond>,
  picked: (model: Model) => RemotePolicy = policy,
) => {
  const { client, asked } = server()
  return Trace.run(Data, {
    start,
    update,
    active,
    client,
    options: { policy: picked },
    steps,
  }).then(trace => ({ trace, asked, last: trace.entries.at(-1)?.model ?? start }))
}

describe('A cacheOnly read', () => {
  it('sends no request when the store is empty', async () => {
    const { asked, last } = await run(offline, [Respond.all])

    expect(asked).toEqual([])
    expect([one.read(last)._tag, projects.read(last)._tag]).toEqual(['Initial', 'Initial'])
  })

  it('sends no request when the store holds what it reads', async () => {
    const { asked, last } = await run(holding, [Respond.all])

    expect(asked).toEqual([])
    expect([one.read(last)._tag, projects.read(last)._tag]).toEqual(['Ready', 'Ready'])
    expect(other.read(last)._tag).toBe('Initial')
  })

  it('says the policy left what it lacks unasked', async () => {
    const { trace, last } = await run(holding, [Respond.all])
    const said = trace.why(last, other)

    expect(said.because[0]).toEqual(Why.CacheOnly({ surfaces: ['other'] }))
    expect(said.message).toMatch(/cacheOnly/)
  })

  it('shows what an answer brings, asking nothing itself', async () => {
    const { asked, last } = await run(offline, [received(['p2']), Respond.all])

    expect(asked).toEqual([])
    expect(other.read(last)).toEqual({ _tag: 'Ready', value: { id: 'p2', name: 'Project p2' } })
  })

  it('follows an answer, a live change and a write that reach the store', () => {
    const answered = Data.reduce(
      holding,
      received(['p1', 'p2'], id => `Renamed ${id}`),
    )
    const patched = Data.reduce(answered, {
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityPatched',
        ref: { entity: 'Project', id: 'p2' },
        values: { name: 'Live' },
        changed: ['name'],
        cursor: 1,
      },
      now: 1,
    })
    const written = Data.reduce(patched, {
      _tag: 'MutationStarted',
      requestId: 'r1',
      optimistic: [{ entity: 'Project', id: 'p1', values: { name: 'Pending' } }],
    } satisfies RemoteMessage)

    expect(other.read(answered)).toEqual({
      _tag: 'Ready',
      value: { id: 'p2', name: 'Renamed p2' },
    })
    expect(other.read(patched)).toEqual({ _tag: 'Ready', value: { id: 'p2', name: 'Live' } })
    expect(one.read(written)).toEqual({ _tag: 'Ready', value: { id: 'p1', name: 'Pending' } })
  })
})

describe('Going online from cacheOnly', () => {
  const entries = Data.subscriptions(active, { policy })

  it('plans exactly what was missing under cacheFirst', () => {
    const cacheFirst = Data.subscriptions(active, {
      policy: (model: Model) => (model.online ? RemotePolicy.cacheFirst : RemotePolicy.cacheOnly),
    })
    const offlinePlan = cacheFirst['other.read'].modelToDependencies(holding)
    const onlinePlan = cacheFirst['other.read'].modelToDependencies({ ...holding, online: true })

    expect([offlinePlan.requirements, offlinePlan.queries]).toEqual([[], []])
    expect(onlinePlan.requirements).toEqual([
      { entity: 'Project', id: 'p2', fields: ['id', 'name'] },
    ])
    expect(cacheFirst['one.read'].modelToDependencies({ ...holding, online: true })).toMatchObject({
      requirements: [],
      queries: [],
    })
  })

  it('asks under cacheFirst for exactly what was missing', async () => {
    const { asked, last } = await run(
      holding,
      [Respond.all, Message.WentOnline({ online: true }), Respond.all],
      model => (model.online ? RemotePolicy.cacheFirst : RemotePolicy.cacheOnly),
    )

    expect(asked).toEqual(['read Project:p2'])
    expect(other.read(last)._tag).toBe('Ready')
  })

  it('asks under networkOnly for what was missing, and what it held again', async () => {
    const { asked, last } = await run(holding, [
      Respond.all,
      Message.WentOnline({ online: true }),
      Respond.all,
    ])

    expect([...asked].sort()).toEqual([
      'query ProjectsByOwner',
      'read Project:p1',
      'read Project:p2',
    ])
    expect(other.read(last)).toEqual({ _tag: 'Ready', value: { id: 'p2', name: 'Project p2' } })
  })

  it('restarts the read entry, since its plan changed', () => {
    const offlinePlan = entries['other.read'].modelToDependencies(holding)
    const onlinePlan = entries['other.read'].modelToDependencies({ ...holding, online: true })

    expect(onlinePlan).not.toEqual(offlinePlan)
  })
})

describe('A policy picked from the Model', () => {
  it('ages a list left only while every call reading it ages it', () => {
    const ageing = Data.subscriptions(
      {
        projects: Data.active('ageing', () =>
          Option.some(Data.query(ProjectsByOwner, { ownerId: 'u2' }, { select: Summary })),
        ),
      },
      {
        policy: (model: Model) =>
          model.online
            ? RemotePolicy.staleWhileRevalidate({ maxAge: 1_000 })
            : RemotePolicy.cacheOnly,
      },
    )
    const roots = (model: Model) =>
      ageing.retain
        .modelToDependencies(model)
        .connections.filter(root => root.identity.includes('u2'))

    expect(roots({ ...offline, online: true })).toMatchObject([{ ages: true }])
    expect(roots(offline)).toEqual([expect.not.objectContaining({ ages: true })])
  })

  it('is read for a prefetch from the Model it prefetches', async () => {
    const { client, asked } = server()
    const prefetched = await Effect.runPromise(
      Remote.prefetch(Data, offline, other, { policy }).pipe(
        Effect.provideService(RemoteClient, client),
      ),
    )

    expect(asked).toEqual([])
    expect(prefetched).toBe(Remote.storeOf(Data, offline))
  })

  it("is read for the domain's prefetch from the Model it prefetches", async () => {
    const { client, asked } = server()
    const prefetched = await Effect.runPromise(
      Data.prefetch(offline, other, { policy }).pipe(Effect.provideService(RemoteClient, client)),
    )
    const online = await Effect.runPromise(
      Data.prefetch({ ...offline, online: true }, other, { policy }).pipe(
        Effect.provideService(RemoteClient, client),
      ),
    )

    expect(prefetched).toBe(offline)
    expect(other.read(online)._tag).toBe('Ready')
    expect(asked).toEqual(['read Project:p2'])
  })
})

describe('why, where something asks', () => {
  const says = (surfaces: Readonly<Record<string, ReturnType<typeof Data.active>>>) =>
    why(Data, offline, other, { surfaces }).because[0]

  it('says nothing is fetching what a Surface another call asks for reads', () => {
    const both = Data.active('both', () => Option.some(other))
    Data.subscriptions({ both })
    Data.subscriptions({ both }, { policy: RemotePolicy.cacheOnly })

    expect(says({ both })).toEqual(Why.NotFetching({ surfaces: ['both'] }))
  })

  it('says nothing is fetching what another Surface asks for too', () => {
    const asking = Data.active('asking', () => Option.some(other))
    const unasking = Data.active('unasking', () => Option.some(other))
    Data.subscriptions({ asking })
    Data.subscriptions({ unasking }, { policy: RemotePolicy.cacheOnly })

    expect(says({ unasking, asking })).toEqual(
      Why.NotFetching({ surfaces: ['unasking', 'asking'] }),
    )
  })

  it('says nothing is fetching what a Surface no call names reads', () => {
    const unnamed = Data.active('unnamed', () => Option.some(other))

    expect(says({ unnamed })).toEqual(Why.NotFetching({ surfaces: ['unnamed'] }))
  })
})
