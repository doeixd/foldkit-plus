/**
 * A list left and gone back to. Retention keeps what the active Surfaces
 * reach, and once kept nothing of a Surface left: going back to a page read
 * `Loading` as if nothing had ever loaded (#225, #234). Now the lists and
 * reads of the Surfaces most recently left stay held, a list stale, so going
 * back shows its rows as `Refreshing` while the list refetches.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, departedLimit, type RemoteMessage } from '../src/index.js'

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
  roots: Remote.retain(shown).modelToDependencies({ remote: Remote.initial }),
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

/** The u1 list loaded and shown, then its Surface left for one showing nothing. */
const left = (): Model =>
  reduceAll({ remote: Remote.initial }, [
    ...loaded(projects, ['p1', 'p2']),
    showing(projects),
    showing(),
  ])

describe('A list whose Surface was left', () => {
  it('shows its rows on going back, reading Refreshing', () => {
    const back = Data.reduce(left(), showing(projects))

    expect(projects.read(back)).toMatchObject({
      _tag: 'Refreshing',
      value: { items: [{ id: 'p1' }, { id: 'p2' }] },
    })
  })

  it('is refetched on going back, and the page replaces what it held', () => {
    const back = Data.reduce(left(), showing(projects))

    expect(Remote.planQueries(Data, back, projects).map(ref => ref.identity)).toEqual([
      projects.ref.identity,
    ])
    const answered = reduceAll(back, loaded(projects, ['p2']))
    expect(projects.read(answered)).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ id: 'p2' }] },
    })
  })

  it('is not marked stale while a Surface still shows it', () => {
    const shown = reduceAll({ remote: Remote.initial }, [
      ...loaded(projects, ['p1']),
      showing(projects),
      showing(projects, listOf('u2')),
    ])

    expect(projects.read(shown)._tag).toBe('Ready')
  })

  it(`is collected once ${departedLimit.connections} lists have been left after it`, () => {
    const lists = Array.from({ length: departedLimit.connections + 1 }, (_, i) => listOf(`o${i}`))
    const visited = reduceAll({ remote: Remote.initial }, [
      ...lists.flatMap(list => [...loaded(list, ['p1']), showing(list)]),
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
    const after = reduceAll({ remote: Remote.initial }, [
      received(['p3']),
      retaining([read('p3')]),
      retaining([]),
    ])

    expect(after.remote.entities['Project:p3']).toBeDefined()
  })

  it(`is collected once ${departedLimit.requirements} reads have been left after it`, () => {
    const ids = Array.from({ length: departedLimit.requirements + 1 }, (_, i) => `r${i}`)
    const after = reduceAll({ remote: Remote.initial }, [
      ...ids.flatMap(id => [received([id]), retaining([read(id)])]),
      retaining([]),
    ])

    expect(after.remote.entities['Project:r0']).toBeUndefined()
    expect(after.remote.entities['Project:r1']).toBeDefined()
  })

  it('is collected when it was never a root', () => {
    const after = reduceAll({ remote: Remote.initial }, [received(['p4']), retaining([])])

    expect(after.remote.entities['Project:p4']).toBeUndefined()
  })
})
