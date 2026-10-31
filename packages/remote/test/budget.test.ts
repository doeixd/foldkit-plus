/**
 * A budget on what retention keeps (#352): rows and lists the Surfaces left
 * are evicted, least recently read first, once they and what the active
 * Surfaces read pass `budget` entries. What an active Surface reads, and what
 * a pending write changes, is never evicted, and `why` says `Evicted`.
 */
import { Effect, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  ConnectionChange,
  Query,
  Remote,
  type RemoteMessage,
  type RetentionRoots,
} from '../src/index.js'
import { why, Why } from '../src/why.js'
import { whyWords } from '../src/whyTerms.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const Named = DomainEntity.select(Project, { name: true })

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
const start: Model = { remote: Remote.initial }

const listOf = (ownerId: string) => Data.query(ByOwner, { ownerId }, { select: Named, first: 25 })
const readOf = (id: string) => Data.get(Named, id)
type Read = ReturnType<typeof listOf> | ReturnType<typeof readOf>

const terminal = { _tag: 'Terminal' } as const
const edge = (id: string) => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })
const values = (id: string, ownerId: string) => ({ name: `Project ${id}`, ownerId })

/** `ownerId`'s list answered with `ids`, their rows riding on the page. */
const listed = (ownerId: string, ids: ReadonlyArray<string>): RemoteMessage => ({
  _tag: 'ConnectionMerged',
  connection: listOf(ownerId).ref.identity,
  page: { edges: ids.map(edge), start: terminal, end: terminal },
  refreshes: true,
  select: { entity: 'Project', fields: ['name', 'ownerId'] },
  entities: ids.map(id => ({ entity: 'Project', id, values: values(id, ownerId) })),
  now: 0,
})

const rootsOf = (...shown: ReadonlyArray<Read>): RetentionRoots =>
  Remote.retain(shown).modelToDependencies(start)

/** What retention hears while `shown` are the active Surfaces' reads, under `budget`. */
const showing =
  (budget: number) =>
  (...shown: ReadonlyArray<Read>): RemoteMessage => ({
    _tag: 'RetentionChanged',
    roots: rootsOf(...shown),
    budget,
  })

const reduceAll = (model: Model, messages: ReadonlyArray<RemoteMessage>): Model =>
  messages.reduce(Data.reduce, model)

/** Three lists of two rows each, shown in turn: each is three entries. */
const [a, b, c] = [listOf('a'), listOf('b'), listOf('c')]
const visitedMessages = (budget: number): ReadonlyArray<RemoteMessage> => [
  listed('a', ['a1', 'a2']),
  showing(budget)(a),
  listed('b', ['b1', 'b2']),
  showing(budget)(b),
  listed('c', ['c1', 'c2']),
  showing(budget)(c),
]
const visited = (budget: number, ...then: ReadonlyArray<RemoteMessage>): Model =>
  reduceAll(start, [...visitedMessages(budget), ...then])

describe('A budget', () => {
  it('evicts the Surface left longest ago first', () => {
    const model = visited(6, showing(6)())
    expect(a.read(model)._tag).toBe('Initial')
    expect(b.read(model)._tag).toBe('Refreshing')
    expect(c.read(model)._tag).toBe('Refreshing')
    expect(model.remote.evicted.connections).toEqual([a.ref.identity])
    expect(Object.keys(model.remote.entities).sort()).toEqual(
      ['b1', 'b2', 'c1', 'c2'].map(id => `Project:${id}`),
    )
  })

  it('evicts every Surface left before one that does not fit, however small', () => {
    // a is two entries, b four, c three: b does not fit beside c, and a,
    // which would, was left before it.
    const model = reduceAll(start, [
      listed('a', ['a1']),
      showing(6)(a),
      listed('b', ['b1', 'b2', 'b3']),
      showing(6)(b),
      listed('c', ['c1', 'c2']),
      showing(6)(c),
    ])
    expect(a.read(model)._tag).toBe('Initial')
    expect(b.read(model)._tag).toBe('Initial')
    expect(model.remote.recent.departed).toEqual([])
  })

  it('counts what the active Surfaces read against it', () => {
    // c is shown: three entries, so of the six only b fits.
    const model = visited(6)
    expect(b.read(model)._tag).toBe('Refreshing')
    expect(a.read(model)._tag).toBe('Initial')
  })

  it('keeps nothing left at none, and never evicts what is shown', () => {
    const model = visited(0)
    expect(c.read(model)._tag).toBe('Ready')
    expect(a.read(model)._tag).toBe('Initial')
    expect(b.read(model)._tag).toBe('Initial')
    expect(model.remote.recent.departed).toEqual([])
  })

  it('reads a Surface shown again as just left, behind those left since', () => {
    // a, then b, then a again, then c: b was left longest ago.
    const model = reduceAll(start, [
      listed('a', ['a1', 'a2']),
      showing(6)(a),
      listed('b', ['b1', 'b2']),
      showing(6)(b),
      showing(6)(a),
      listed('c', ['c1', 'c2']),
      showing(6)(c),
    ])
    expect(a.read(model)._tag).toBe('Refreshing')
    expect(b.read(model)._tag).toBe('Initial')
    expect(model.remote.recent.departed).toEqual([rootsOf(a)])
    expect(model.remote.evicted.connections).toEqual([b.ref.identity])
  })

  it('counts a row two Surfaces read once', () => {
    // b shows a's rows: it adds itself alone.
    const model = reduceAll(start, [
      listed('a', ['a1', 'a2']),
      showing(4)(a),
      { ...listed('b', ['a1', 'a2']) },
      showing(4)(b),
      showing(4)(),
    ])
    expect(a.read(model)._tag).toBe('Refreshing')
    expect(b.read(model)._tag).toBe('Refreshing')
  })

  it('counts a read whose row is held already as one, so the reads kept stay bounded', () => {
    const at = (budget: number) =>
      reduceAll(start, [
        listed('a', ['a1', 'a2']),
        showing(budget)(a, readOf('a1')),
        showing(budget)(a),
      ])
    // a is three entries, and holds the read's row; the read left costs one.
    expect(at(4).remote.recent.departed).toEqual([rootsOf(readOf('a1'))])
    expect(at(3).remote.recent.departed).toEqual([])
    expect(at(3).remote.evicted.rows).toEqual(['Project:a1'])
  })

  it('counts an empty list as one entry', () => {
    const empty = ['e1', 'e2', 'e3'].map(listOf)
    const model = reduceAll(
      start,
      empty.flatMap(list => [
        {
          _tag: 'ConnectionMerged' as const,
          connection: list.ref.identity,
          page: { edges: [], start: terminal, end: terminal },
          refreshes: true,
          now: 0,
        },
        showing(2)(list),
      ]),
    )
    expect(empty.map(list => list.read(model)._tag)).toEqual(['Initial', 'Refreshing', 'Ready'])
  })

  it('keeps a list a pending write changes, with its rows, until the write settles', () => {
    const pending = reduceAll(start, [
      listed('a', ['a1', 'a2']),
      showing(0)(a),
      {
        _tag: 'MutationStarted',
        requestId: 'create',
        optimistic: [
          { entity: 'Project', id: 'a3', values: values('a3', 'a') },
          ConnectionChange.prepend(listOf('a').ref, { entity: 'Project', id: 'a3' }),
        ],
      },
      showing(0)(c),
    ])
    expect(pending.remote.evicted.connections).toEqual([a.ref.identity])
    expect(a.read(pending)).toMatchObject({
      value: { items: [{ name: 'Project a1' }, { name: 'Project a2' }, { name: 'Project a3' }] },
    })
    const settled = reduceAll(pending, [
      {
        _tag: 'MutationFailed',
        requestId: 'create',
        error: { _tag: 'RemoteMutationError', message: 'no' },
        operation: 'create',
      },
      showing(0)(),
    ])
    expect(a.read(settled)._tag).toBe('Initial')
  })

  it('counts what a pending write changes against it', () => {
    // A row the store holds, which only the pending rename keeps.
    const writing: ReadonlyArray<RemoteMessage> = [
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Project', id: 'x1', fields: ['name'] }],
        result: { settled: [], entities: [{ entity: 'Project', id: 'x1', values: { name: 'X' } }] },
        now: 0,
      },
      {
        _tag: 'MutationStarted',
        requestId: 'rename',
        optimistic: [{ entity: 'Project', id: 'x1', values: { name: 'Renamed' } }],
      },
    ]
    // c and the renamed row are four of the six: b no longer fits.
    expect(b.read(visited(6))._tag).toBe('Refreshing')
    expect(b.read(reduceAll(start, [...writing, ...visitedMessages(6)]))._tag).toBe('Initial')
  })

  it('remembers a list evicted twice once, as evicted last', () => {
    const model = reduceAll(start, [
      listed('a', ['a1', 'a2']),
      showing(0)(a),
      listed('b', ['b1', 'b2']),
      showing(0)(b),
      listed('a', ['a1', 'a2']),
      showing(0)(a),
      showing(0)(),
    ])
    expect(model.remote.evicted.connections).toEqual([b.ref.identity, a.ref.identity])
  })

  it('remembers the newest 256 lists it evicted', () => {
    const lists = Array.from({ length: 300 }, (_, i) => listOf(`o${i}`))
    const model = reduceAll(
      start,
      lists.flatMap((list, i) => [listed(`o${i}`, [`r${i}`]), showing(0)(list)]),
    )
    const evicted = model.remote.evicted.connections
    expect(evicted).toHaveLength(256)
    expect(evicted.at(-1)).toBe(lists[298]!.ref.identity)
    expect(evicted[0]).toBe(lists[43]!.ref.identity)
  })

  it('evicts nothing, and keeps the Model, when the roots are as they were', () => {
    const model = visited(6, showing(6)())
    expect(Data.reduce(model, showing(6)())).toBe(model)
  })
})

describe('why on what the budget evicted', () => {
  const evicted = visited(6, showing(6)())

  it('says a list is Evicted, not merely Missing', () => {
    expect(why(Data, evicted, a).because).toContainEqual(
      Why.List({
        list: { query: 'ByOwner', identity: a.ref.identity },
        held: 'Evicted',
        inFlight: false,
      }),
    )
    // A list never loaded is Missing.
    expect(why(Data, evicted, listOf('z')).because).toContainEqual(
      Why.List({
        list: { query: 'ByOwner', identity: listOf('z').ref.identity },
        held: 'Missing',
        inFlight: false,
      }),
    )
  })

  it("says a read's row is Evicted, and Missing once it is held again without the field", () => {
    const read = readOf('a1')
    const left = reduceAll(start, [
      {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Project', id: 'a1', fields: ['name'] }],
        result: { settled: [], entities: [{ entity: 'Project', id: 'a1', values: { name: 'A' } }] },
        now: 0,
      },
      showing(0)(read),
      showing(0)(),
    ])
    const because = Why.Fields({
      row: { entity: 'Project', id: 'a1' },
      via: [],
      fields: ['name'],
      held: 'Evicted',
      inFlight: false,
    })
    expect(why(Data, left, read).because).toContainEqual(because)
    expect(whyWords(because)).toContain(
      "evicted to keep the cache within its budget (Remote.make's budget)",
    )
    const other = Data.reduce(left, {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Project', id: 'a1', fields: ['ownerId'] }],
      result: {
        settled: [],
        entities: [{ entity: 'Project', id: 'a1', values: { ownerId: 'a' } }],
      },
      now: 0,
    })
    expect(why(Data, other, read).because).toContainEqual(
      Why.Fields({
        row: { entity: 'Project', id: 'a1' },
        via: [],
        fields: ['name'],
        held: 'Missing',
        inFlight: false,
      }),
    )
  })
})

describe("Remote.make's budget", () => {
  const sent = (Domain: typeof Data) =>
    Effect.runPromise(
      Stream.runCollect(
        Domain.subscriptions({
          page: App.surface('Page', { model: () => ({ a }) }),
        }).retain.dependenciesToStream(rootsOf(a)),
      ),
    )

  it('reaches retention on its Message, and is left off when not given', async () => {
    const budgeted = Remote.make({
      model: App.model.remote,
      entities: [Project],
      queries: [ByOwner],
      budget: 5,
    })
    expect(await sent(budgeted)).toEqual([
      { _tag: 'RetentionChanged', roots: rootsOf(a), budget: 5 },
    ])
    expect(await sent(Data)).toEqual([{ _tag: 'RetentionChanged', roots: rootsOf(a) }])
  })

  it('is given to a retain entry wired by hand', async () => {
    const entry = Remote.retain([a], undefined, { budget: 3 })
    expect(
      await Effect.runPromise(Stream.runCollect(entry.dependenciesToStream(rootsOf(a)))),
    ).toEqual([{ _tag: 'RetentionChanged', roots: rootsOf(a), budget: 3 }])
  })

  it.each([-1, Number.NaN])('refuses %s where it is given', budget => {
    expect(() =>
      Remote.make({ model: App.model.remote, entities: [Project], queries: [ByOwner], budget }),
    ).toThrow(/budget is how many entries/)
    expect(() => Remote.retain([a], undefined, { budget })).toThrow(/budget is how many entries/)
  })
})

describe('A list the store does not hold, marked fresh', () => {
  it('stays unloaded, never or only invalidated', () => {
    const z = listOf('z')
    const fresh: RemoteMessage = { _tag: 'ConnectionRefreshed', connection: z.ref.identity }
    expect(Data.reduce(start, fresh)).toBe(start)
    const invalidated = Data.reduce(start, {
      _tag: 'ConnectionInvalidated',
      connection: z.ref.identity,
    })
    expect(z.read(Data.reduce(invalidated, fresh))._tag).toBe('Initial')
  })
})
