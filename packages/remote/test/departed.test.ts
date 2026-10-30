/**
 * A list left and gone back to. Retention keeps what the active Surfaces
 * reach, and once kept nothing of a Surface left: going back to a page read
 * `Loading` as if nothing had ever loaded (#225, #234). Now the lists and
 * reads of the Surfaces most recently left stay held, a list stale, so going
 * back shows its rows as `Refreshing` while the list refetches.
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
  isRemoteMessage,
  type RemoteClient,
  type RemoteMessage,
} from '../src/index.js'
import { Respond, Trace } from '../src/testing.js'

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

const Model = Schema.Struct({ remote: Remote.Model, owners: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const own = { Showed: { owners: Schema.Array(Schema.String) } }
const Message = defineMessageUnion({ ...Remote.messages, ...own })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})

const listOf = (ownerId: string) =>
  Data.query(ProjectsByOwner, { ownerId }, { select: Summary, first: 25 })
const projects = listOf('u1')

const edge = (id: string) => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })
const terminal = { _tag: 'Terminal' } as const

const reduceAll = (model: Model, messages: ReadonlyArray<RemoteMessage>): Model =>
  messages.reduce(Data.reduce, model)

/** The Message `Remote.retain` sends while `shown` are the active Surfaces' projections. */
const showing = (...shown: ReadonlyArray<ReturnType<typeof listOf>>): RemoteMessage => ({
  _tag: 'RetentionChanged',
  roots: Remote.retain(shown).modelToDependencies({ remote: Remote.initial, owners: [] }),
})

/** `list` answered with `ids`, each row read. */
const loaded = (list: ReturnType<typeof listOf>, ids: ReadonlyArray<string>): RemoteMessage[] => [
  {
    _tag: 'ConnectionMerged',
    connection: list.ref.identity,
    page: { edges: ids.map(edge), start: terminal, end: terminal },
    refreshes: true,
  },
  {
    _tag: 'ReadReceived',
    requests: ids.map(id => ({ entity: 'Project', id, fields: ['id', 'name'] })),
    result: {
      settled: [],
      entities: ids.map(id => ({ entity: 'Project', id, values: { id, name: `Project ${id}` } })),
    },
    now: 0,
  },
]

const Own = defineMessageUnion(own)
const update = (model: Model, message: Message): Update.Return<Model, Message> => {
  if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
  return Own.match(message, {
    Showed: ({ owners }) => ({ model: modifyFields(model, { owners: () => owners }) }),
  })
}

/** A list's page for each owner shown: what a Surface reading `listOf(owner)` reads. */
const active = Object.fromEntries(
  ['u1', 'u2'].map(owner => [
    owner,
    Data.active(owner, (model: Model) =>
      model.owners.includes(owner) ? Option.some(listOf(owner)) : Option.none(),
    ),
  ]),
)

/** A server answering each query with the next of `pages`, its rows' fields riding on it. */
const server = (pages: Array<ReadonlyArray<string>>): RemoteClient['Service'] => ({
  read: () => Effect.die('every row arrives with its page'),
  query: request => {
    const ids = pages.shift() ?? []
    const row = (id: string): Readonly<Record<string, string>> => ({
      id,
      name: `Project ${id}`,
      ownerId: 'u1',
    })
    return Effect.succeed({
      edges: ids.map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
      start: terminal,
      end: terminal,
      entities: ids.map(id => ({
        entity: 'Project',
        id,
        values: Object.fromEntries(
          (request.select?.fields ?? []).map(field => [field, row(id)[field]]),
        ),
      })),
    })
  },
  mutate: () => Effect.die('unused'),
  live: () => Stream.empty,
})

/** The u1 list loaded and shown, its Surface left, then gone back to. */
const back = (then: ReadonlyArray<Message | Respond> = []) =>
  Trace.run(Data, {
    start: { remote: Remote.initial, owners: ['u1'] },
    update,
    active,
    client: server([['p1', 'p2'], ['p2']]),
    steps: [
      Respond.all,
      Message.Showed({ owners: [] }),
      Message.Showed({ owners: ['u1'] }),
      ...then,
    ],
  })

describe('A list whose Surface was left', () => {
  it('shows its rows on going back, reading Refreshing', async () => {
    const trace = await back()

    expect(Trace.tags(trace, projects)).toEqual(['Initial', 'Loading', 'Ready', 'Refreshing'])
    expect(Trace.regressions(trace, { projects })).toEqual([])
    expect(projects.read(trace.entries.at(-1)!.model)).toMatchObject({
      _tag: 'Refreshing',
      value: { items: [{ id: 'p1' }, { id: 'p2' }] },
    })
  })

  it('is refetched on going back, and the page replaces what it held', async () => {
    const trace = await back([Respond.query(projects.ref)])

    expect(projects.read(trace.entries.at(-1)!.model)).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ id: 'p2' }] },
    })
  })

  it('is not marked stale while a Surface still shows it', async () => {
    const trace = await Trace.run(Data, {
      start: { remote: Remote.initial, owners: ['u1'] },
      update,
      active,
      client: server([['p1'], []]),
      steps: [Respond.all, Message.Showed({ owners: ['u1', 'u2'] }), Respond.all],
    })

    expect(Trace.tags(trace, projects)).toEqual(['Initial', 'Loading', 'Ready'])
  })

  it('is evicted once the lists left after it spend the budget', () => {
    // Each list and its one row are two entries. Shown with the 499 lists
    // after them, the second list fills the default budget of 1,000 and the
    // first does not fit. Few batches, so each change walks few roots (#362).
    const lists = Array.from({ length: 501 }, (_, i) => listOf(`o${i}`))
    const [first, second, ...rest] = lists
    const visited = reduceAll({ remote: Remote.initial, owners: [] }, [
      ...loaded(first!, ['p0']),
      showing(first!),
      ...loaded(second!, ['p1']),
      showing(second!),
      ...rest.flatMap((list, i) => loaded(list, [`p${i + 2}`])),
      showing(...rest),
      showing(),
    ])

    expect(visited.remote.connections[lists[0]!.ref.identity]).toBeUndefined()
    expect(lists[0]!.read(visited)._tag).toBe('Initial')
    expect(lists[1]!.read(visited)._tag).toBe('Refreshing')
  })
})

describe('A read whose Surface was left', () => {
  const read = (id: string) => ({ entity: 'Project', id, fields: ['name'] })
  const retaining = (requirements: ReadonlyArray<ReturnType<typeof read>>): RemoteMessage => ({
    _tag: 'RetentionChanged',
    roots: { requirements, connections: [] },
  })
  const received = (ids: ReadonlyArray<string>): RemoteMessage => ({
    _tag: 'ReadReceived',
    requests: ids.map(read),
    result: {
      settled: [],
      entities: ids.map(id => ({ entity: 'Project', id, values: { name: id } })),
    },
    now: 0,
  })

  it('keeps its value', () => {
    const after = reduceAll({ remote: Remote.initial, owners: [] }, [
      received(['p3']),
      retaining([read('p3')]),
      retaining([]),
    ])

    expect(after.remote.entities['Project:p3']).toBeDefined()
  })

  it('is evicted once the reads left after it spend the budget', () => {
    // Each read is one entry, its row. Shown with the 999 reads after them,
    // r1 fills the default budget of 1,000 and r0 does not fit.
    const rest = Array.from({ length: 999 }, (_, i) => read(`r${i + 2}`))
    const after = reduceAll({ remote: Remote.initial, owners: [] }, [
      received(['r0']),
      retaining([read('r0')]),
      received(['r1']),
      retaining([read('r1')]),
      received(rest.map(root => root.id)),
      retaining(rest),
      retaining([]),
    ])

    expect(after.remote.entities['Project:r0']).toBeUndefined()
    expect(after.remote.entities['Project:r1']).toBeDefined()
  })

  it('is collected when it was never a root', () => {
    const after = reduceAll({ remote: Remote.initial, owners: [] }, [
      received(['p4']),
      retaining([]),
    ])

    expect(after.remote.entities['Project:p4']).toBeUndefined()
  })
})
