/**
 * Saved reads with their own age and an eviction order (#404): each row and
 * list a snapshot keeps expires `maxAge` after it was fetched, or after what
 * the calls reading it say (`persist`); what has expired is dropped when the
 * snapshot is written and again when it is read; and past `maxBytes` the
 * batches read least recently go first, keeping a row a kept batch reaches.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, type RemoteMessage, type RetentionRoots } from '../src/index.js'
import { persistence, RemotePersistence, type Snapshot } from '../src/persistence.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, group: Schema.String }),
)
const Named = DomainEntity.select(Project, { name: true })
const ByGroup = Query.define('ByGroup', { group: Schema.String }, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })

/** A domain of its own: `Data.subscriptions` registers its readers with the domain. */
const domain = () =>
  Remote.make({ model: App.model.remote, entities: [Project], queries: [ByGroup] })
type Data = ReturnType<typeof domain>
const Data = domain()
const start: Model = { remote: Remote.initial }

const listOf = (group: string) => Data.query(ByGroup, { group }, { select: Named, first: 25 })
const readOf = (id: string) => Data.get(Named, id)
type Read = ReturnType<typeof listOf> | ReturnType<typeof readOf>

const terminal = { _tag: 'Terminal' } as const
const edge = (id: string) => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })

/** `group`'s list answered at `now` with `ids`, their rows riding on the page. */
const listed = (group: string, ids: ReadonlyArray<string>, now: number): RemoteMessage => ({
  _tag: 'ConnectionMerged',
  connection: listOf(group).ref.identity,
  page: { edges: ids.map(edge), start: terminal, end: terminal },
  refreshes: true,
  select: { entity: 'Project', fields: ['name'] },
  entities: ids.map(id => ({ entity: 'Project', id, values: { name: `Project ${id}` } })),
  now,
})

/** Row `id` read at `now`. */
const read = (id: string, now: number): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: [{ entity: 'Project', id, fields: ['name'] }],
  result: { settled: [], entities: [{ entity: 'Project', id, values: { name: `Project ${id}` } }] },
  now,
})

/** What retention hears while `shown` are the active Surfaces' reads. */
const showing = (...shown: ReadonlyArray<Read>): RemoteMessage => ({
  _tag: 'RetentionChanged',
  roots: Remote.retain(shown).modelToDependencies(start),
  budget: Infinity,
})

const reduceAll = (data: Data, messages: ReadonlyArray<RemoteMessage>): Model =>
  messages.reduce(data.reduce, start)

const groups = (snapshot: Snapshot) => Object.keys(snapshot.connections).length
const rows = (snapshot: Option.Option<Snapshot> | Snapshot) =>
  Object.keys(Option.isOption(snapshot) ? Option.getOrThrow(snapshot).entities : snapshot.entities)
    .map(key => key.slice('Project:'.length))
    .sort()

/** Runs `effect` against a fresh store with the clock at `at`. */
const at = <A>(time: number, effect: Effect.Effect<A, unknown, KeyValueStore.KeyValueStore>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(time)
      return yield* effect
    }).pipe(Effect.provide(KeyValueStore.layerMemory), Effect.provide(TestClock.layer())),
  )

describe('a saved read’s age', () => {
  // p1 fetched at 0, p2 at 5,000; each lasts 1,000.
  const model = reduceAll(Data, [read('p1', 0), read('p2', 5_000)])
  const snapshot = RemotePersistence.snapshotOf(model.remote, { maxAge: 1_000 })

  it('is measured from when it was fetched', () => {
    expect(snapshot.expires.rows).toEqual({ 'Project:p1': 1_000, 'Project:p2': 6_000 })
  })

  it('drops what has expired when the snapshot is written', async () => {
    const stored = await at(
      5_500,
      Effect.gen(function* () {
        yield* RemotePersistence.save(snapshot, { key: 'cache' })
        return yield* (yield* KeyValueStore.KeyValueStore).get('cache')
      }),
    )
    expect(rows(RemotePersistence.hydrate(stored))).toEqual(['p2'])
  })

  it('drops what has expired when the snapshot is read', async () => {
    const restored = await at(
      0,
      Effect.gen(function* () {
        yield* RemotePersistence.save(snapshot, { key: 'cache' })
        yield* TestClock.setTime(1_000)
        return yield* RemotePersistence.restore({ key: 'cache' })
      }),
    )
    expect(rows(restored)).toEqual(['p2'])
  })

  it('keeps what is younger than its maxAge, to the millisecond', () => {
    const text = RemotePersistence.dehydrate(snapshot)
    expect(rows(RemotePersistence.hydrate(text, { now: 999 }))).toEqual(['p1', 'p2'])
    expect(rows(RemotePersistence.hydrate(text, { now: 1_000 }))).toEqual(['p2'])
  })

  it('is not extended by restoring it', () => {
    const text = RemotePersistence.dehydrate(snapshot)
    const restored = Data.reduce(
      start,
      RemotePersistence.hydrated(Option.getOrThrow(RemotePersistence.hydrate(text, { now: 500 })), {
        merge: 'preserve-existing',
      }),
    )
    expect(RemotePersistence.snapshotOf(restored.remote, { maxAge: 1_000 }).expires).toEqual(
      snapshot.expires,
    )
  })

  it('of a list goes on across a restore, from the page that answered it', () => {
    const list = listOf('a')
    const visited = reduceAll(Data, [listed('a', ['p1'], 3_000), showing(list)])
    const saved = RemotePersistence.snapshotOf(visited.remote, {
      connections: [list.ref],
      maxAge: 1_000,
    })
    expect(saved.expires.lists).toEqual({ [list.ref.identity]: 4_000 })
    const restored = Data.reduce(
      start,
      RemotePersistence.hydrated(
        Option.getOrThrow(RemotePersistence.hydrate(RemotePersistence.dehydrate(saved))),
        { merge: 'preserve-existing' },
      ),
    )
    expect(restored.remote.connections[list.ref.identity]?.receivedAt).toBe(3_000)
  })

  it('of an empty list is dated by its page, so it is saved', () => {
    const list = listOf('none')
    const empty = Data.reduce(
      Data.reduce(start, showing(list)),
      Remote.queryMessage(
        list.ref,
        { edges: [], start: terminal, end: terminal },
        undefined,
        7_000,
      ),
    )
    const saved = RemotePersistence.snapshotOf(empty.remote, {
      connections: [list.ref],
      maxAge: 1_000,
    })
    expect(saved.expires.lists).toEqual({ [list.ref.identity]: 8_000 })
  })

  it('is refused when it is not 0 or more milliseconds', () => {
    expect(() => RemotePersistence.snapshotOf(start.remote, { maxAge: -1 })).toThrow(/maxAge/)
    expect(() =>
      persistence(Data, { key: () => 'k', scope: () => 's', maxAge: Number.NaN }),
    ).toThrow(/maxAge/)
    expect(() => Data.subscriptions({}, { persist: { maxAge: -1 } })).toThrow(/maxAge/)
  })
})

describe('what a call says of saving what it reads', () => {
  /** A domain whose `private` call reads p1 with `persist`, and whose other call reads p2. */
  const twoCalls = (persist: false | { readonly maxAge: number }) => {
    const data = domain()
    const one = { one: data.active('one', () => Option.some(data.get(Named, 'p1'))) }
    const two = { two: data.active('two', () => Option.some(data.get(Named, 'p2'))) }
    data.subscriptions(one, { persist })
    const retain = data.subscriptions(two).retain
    const loaded = reduceAll(data, [read('p1', 1_000), read('p2', 2_000)])
    const roots: RetentionRoots = retain.modelToDependencies(loaded)
    return data.reduce(loaded, { _tag: 'RetentionChanged', roots })
  }

  it('saves none of it under persist: false', () => {
    const model = twoCalls(false)
    expect(rows(RemotePersistence.snapshotOf(model.remote))).toEqual(['p2'])
  })

  it('gives it the call’s own maxAge', () => {
    const model = twoCalls({ maxAge: 10_000 })
    expect(RemotePersistence.snapshotOf(model.remote, { maxAge: 1_000 }).expires.rows).toEqual({
      'Project:p1': 11_000,
      'Project:p2': 3_000,
    })
  })

  it('keeps saying it once the Surface is left', () => {
    const model = twoCalls(false)
    const left = Data.reduce(model, showing())
    expect(left.remote.recent.departed).toHaveLength(1)
    expect(rows(RemotePersistence.snapshotOf(left.remote))).toEqual(['p2'])
  })

  it('takes false over an age, and the longer of two ages, where calls share a row', () => {
    const data = domain()
    const reader = data.active('shared', () => Option.some(data.get(Named, 'p1')))
    data.subscriptions({ a: reader }, { persist: { maxAge: 5_000 } })
    data.subscriptions({ b: reader }, { persist: { maxAge: 9_000 } })
    const retain = data.subscriptions({}).retain
    const loaded = reduceAll(data, [read('p1', 0)])
    expect(retain.modelToDependencies(loaded).requirements).toMatchObject([{ persist: 9_000 }])
    data.subscriptions({ c: reader }, { persist: false })
    expect(retain.modelToDependencies(loaded).requirements).toMatchObject([{ persist: false }])
  })

  it('is said of a retain entry wired by hand', () => {
    const roots = Remote.retain([readOf('p1')], undefined, { persist: false }).modelToDependencies(
      start,
    )
    expect(roots.requirements).toMatchObject([{ id: 'p1', persist: false }])
  })

  it('leaves a row another read reaches saved', () => {
    const data = domain()
    const hidden = { hidden: data.active('hidden', () => Option.some(data.get(Named, 'p1'))) }
    const list = data.query(ByGroup, { group: 'a' }, { select: Named, first: 25 })
    const shown = { shown: data.active('shown', () => Option.some(list)) }
    data.subscriptions(hidden, { persist: false })
    const retain = data.subscriptions(shown).retain
    const loaded = reduceAll(data, [listed('a', ['p1', 'p2'], 0)])
    const model = data.reduce(loaded, {
      _tag: 'RetentionChanged',
      roots: retain.modelToDependencies(loaded),
    })
    expect(rows(RemotePersistence.snapshotOf(model.remote))).toEqual(['p1', 'p2'])
  })
})

describe('a snapshot past maxBytes', () => {
  const [a, b, c] = [listOf('a'), listOf('b'), listOf('c')]
  const connections = [a.ref, b.ref, c.ref]
  // a is the smallest, so a cut that leaves b out has room for it.
  const members = { a: ['a1'], b: ['b1', 'b2'], c: ['c1', 'c2'] }
  // Shown a, then b, then c: c is read most recently, a least.
  const model = reduceAll(Data, [
    listed('a', members.a, 0),
    showing(a),
    listed('b', ['b1', 'b2'], 0),
    showing(b),
    listed('c', ['c1', 'c2'], 0),
    showing(c),
  ])
  const snapshot = RemotePersistence.snapshotOf(model.remote, { connections })
  /** The size of the snapshot of `lists` alone, shown in the same order. */
  const sizeOf = (...lists: ReadonlyArray<keyof typeof members>) => {
    const alone = reduceAll(Data, [
      ...lists.flatMap(group => [listed(group, members[group], 0), showing(listOf(group))]),
    ])
    const text = RemotePersistence.dehydrate(
      RemotePersistence.snapshotOf(alone.remote, {
        connections: lists.map(group => listOf(group).ref),
      }),
    )
    return new TextEncoder().encode(text).length
  }
  const keptAt = (maxBytes: number) =>
    Option.getOrThrow(
      RemotePersistence.hydrate(RemotePersistence.dehydrate(snapshot, { maxBytes }) ?? ''),
    )

  it('orders its batches by retention’s recency, most recent first', () => {
    expect(snapshot.recency.map(batch => batch.lists)).toEqual([
      [c.ref.identity],
      [b.ref.identity],
      [a.ref.identity],
    ])
  })

  it('drops the batch read least recently first, to the byte', () => {
    expect(rows(keptAt(sizeOf('b', 'c')))).toEqual(['b1', 'b2', 'c1', 'c2'])
    expect(groups(keptAt(sizeOf('b', 'c')))).toBe(2)
    expect(rows(keptAt(sizeOf('b', 'c') - 1))).toEqual(['c1', 'c2'])
  })

  it('stops at the first batch that does not fit, though an older one would', () => {
    // c fits; b does not, so a, older and smaller, goes with it.
    expect(rows(keptAt(sizeOf('a', 'c')))).toEqual(['c1', 'c2'])
  })

  it('is not written when it has no order', () => {
    expect(
      RemotePersistence.dehydrate({ ...snapshot, recency: [] }, { maxBytes: sizeOf('b', 'c') }),
    ).toBeUndefined()
  })

  it('drops what no read reaches before anything read', () => {
    const unread = Data.reduce(model, read('loose', 0))
    const all = RemotePersistence.snapshotOf(unread.remote, { connections })
    expect(all.recency.at(-1)).toEqual({ rows: ['Project:loose'], lists: [] })
  })
})

describe('a row two lists name', () => {
  const [a, b] = [listOf('a'), listOf('b')]
  // a, older, names shared and a1; b, newer, names shared and b1.
  const model = reduceAll(Data, [
    listed('a', ['a1', 'shared'], 0),
    showing(a),
    listed('b', ['b1', 'shared'], 0),
    showing(b),
  ])
  const snapshot = RemotePersistence.snapshotOf(model.remote, { connections: [a.ref, b.ref] })

  it('stays while the list kept names it, when the other is evicted', () => {
    const onlyB = RemotePersistence.snapshotOf(Data.reduce(model, showing(b)).remote, {
      connections: [b.ref],
    })
    const maxBytes = new TextEncoder().encode(
      RemotePersistence.dehydrate({ ...onlyB, recency: [] }),
    ).length
    const kept = Option.getOrThrow(
      RemotePersistence.hydrate(RemotePersistence.dehydrate(snapshot, { maxBytes }) ?? ''),
    )
    expect(rows(kept)).toEqual(['b1', 'shared'])
    expect(Object.keys(kept.connections)).toEqual([b.ref.identity])
  })

  it('stays while the list kept names it, though the row on its own has expired', () => {
    // shared was fetched at 0; b answered again at 5,000 without its fields.
    const asked = Data.reduce(model, {
      _tag: 'RefreshStarted',
      requests: [],
      connections: [b.ref.identity],
    })
    const later = Data.reduce(asked, {
      _tag: 'ConnectionMerged',
      connection: b.ref.identity,
      page: { edges: ['b1', 'shared'].map(edge), start: terminal, end: terminal },
      refreshes: true,
      entities: [],
      settled: [],
      now: 5_000,
    })
    const saved = RemotePersistence.snapshotOf(later.remote, {
      connections: [a.ref, b.ref],
      maxAge: 1_000,
    })
    const restored = RemotePersistence.hydrate(RemotePersistence.dehydrate(saved), { now: 5_500 })
    expect(rows(restored)).toEqual(['b1', 'shared'])
    expect(Object.keys(Option.getOrThrow(restored).connections)).toEqual([b.ref.identity])
  })
})

describe('the stored format', () => {
  it('refuses a snapshot of the version before, and removes it', async () => {
    // What version 5 wrote: no ages, and a list as its bare segments.
    const old = JSON.stringify({
      version: 5,
      scope: null,
      entities: {
        'Project:p1': {
          values: { name: 'Old' },
          present: ['name'],
          stale: [],
          unavailable: [],
          tombstone: false,
          updatedAt: 0,
          windows: {},
        },
      },
      connections: { list: [[edge('p1')]] },
    })
    const result = await at(
      0,
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.set('cache', old)
        const restored = yield* RemotePersistence.restore({ key: 'cache' })
        return { restored, after: yield* kv.get('cache') }
      }),
    )
    expect(result.restored).toEqual(RemotePersistence.emptySnapshot)
    expect(result.after).toBeUndefined()
  })
})

describe('persistence(Data, { maxAge })', () => {
  it('saves only what is younger than its maxAge when it writes', async () => {
    const data = domain()
    const save = persistence(data, {
      key: () => 'cache',
      scope: () => 'me',
      maxAge: 1_000,
      debounce: 0,
    }).subscriptions!['persistence.save']!
    const model = reduceAll(data, [
      { _tag: 'Hydrated', entities: {}, merge: 'preserve-existing', from: 'cache' },
      read('p1', 0),
      read('p2', 5_000),
    ])
    const stored = await at(
      5_500,
      Effect.gen(function* () {
        const dependencies = save.modelToDependencies(model)
        yield* Stream.runDrain(save.dependenciesToStream(dependencies, () => dependencies))
        return yield* (yield* KeyValueStore.KeyValueStore).get('cache')
      }),
    )
    expect(rows(RemotePersistence.hydrate(stored, { scope: 'me' }))).toEqual(['p2'])
  })
})
