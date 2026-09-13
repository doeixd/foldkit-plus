/**
 * The kernel over an in-memory store: codecs, defaults, reduce, href, the
 * write entry, restore, and the contract.
 */
import { Effect, Fiber, Layer, Schema, SchemaGetter, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Module, Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mirror, MirrorStore, applyToHref, type MirrorRestored } from '../src/index.js'

const Model = Schema.Struct({
  filter: Schema.Literals(['all', 'active', 'done']),
  page: Schema.Number,
  q: Schema.String,
  open: Schema.Boolean,
  tags: Schema.Array(Schema.String),
  editingId: Schema.NullOr(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Mirror.messages, Ping: {} })
const initial: Model = { filter: 'all', page: 1, q: '', open: false, tags: [], editingId: null }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const Filters = Projection.pick(App.fields.filter, App.fields.page, App.fields.q)
const mirror = (store = MirrorStore.memory()) =>
  Mirror.make(App, store, { name: 'filters', fields: Filters, keys: { q: { history: 'replace' } } })

describe('encode and decode', () => {
  it('derives each key’s codec from the field and elides the initial value', () => {
    const m = Mirror.make(App, MirrorStore.memory(), {
      fields: Projection.pick(
        App.fields.filter,
        App.fields.page,
        App.fields.q,
        App.fields.open,
        App.fields.tags,
        App.fields.editingId,
      ),
    })
    expect(m.encode(initial)).toEqual({})
    const changed: Model = {
      filter: 'active',
      page: 3,
      q: 'apollo',
      open: true,
      tags: ['a', 'b'],
      editingId: 't1',
    }
    expect(m.encode(changed)).toEqual({
      filter: 'active',
      page: '3',
      q: 'apollo',
      open: 'true',
      tags: '["a","b"]',
      editingId: '"t1"',
    })
    expect(m.decode(m.encode(changed))).toEqual({ value: changed, issues: [] })
    expect(m.keys).toEqual({
      filter: 'filter',
      page: 'page',
      q: 'q',
      open: 'open',
      tags: 'tags',
      editingId: 'editingId',
    })
  })

  it('a key that fails to decode is an issue naming it; the rest decode', () => {
    const m = mirror()
    expect(m.decode({ filter: 'nope', page: 'abc', q: 'x' })).toEqual({
      value: { q: 'x' },
      issues: [
        { key: 'filter', message: 'Expected "all" | "active" | "done"' },
        { key: 'page', message: '"abc" is not a number' },
      ],
    })
    const b = Mirror.make(App, MirrorStore.memory(), { fields: Projection.pick(App.fields.open) })
    expect(b.decode({ open: 'yes' }).issues).toEqual([
      { key: 'open', message: '"yes" is not "true" or "false"' },
    ])
    const t = Mirror.make(App, MirrorStore.memory(), { fields: Projection.pick(App.fields.tags) })
    expect(t.decode({ tags: '[oops' }).issues).toEqual([
      { key: 'tags', message: '"[oops" is not JSON' },
    ])
    expect(t.decode({ tags: '[1]' }).issues[0]).toMatchObject({ key: 'tags' })
    expect(m.decode({ page: ' ' }).issues).toEqual([
      { key: 'page', message: '" " is not a number' },
    ])
  })

  it('takes another key name, a codec, and keeps a default when asked', () => {
    const m = Mirror.make(App, MirrorStore.memory(), {
      fields: Projection.pick(App.fields.tags, App.fields.page),
      keys: {
        tags: {
          key: 't',
          codec: Schema.String.pipe(
            Schema.decodeTo(Schema.Array(Schema.String), {
              decode: SchemaGetter.transform((text: string) =>
                text === '' ? [] : text.split(','),
              ),
              encode: SchemaGetter.transform((tags: ReadonlyArray<string>) => tags.join(',')),
            }),
          ),
        },
        page: { keep: true },
      },
    })
    expect(m.keys).toEqual({ tags: 't', page: 'page' })
    expect(m.encode(initial)).toEqual({ page: '1' })
    expect(m.encode({ ...initial, tags: ['a', 'b'] })).toEqual({ t: 'a,b', page: '1' })
    expect(m.decode({ t: 'a,b' }).value).toEqual({ tags: ['a', 'b'] })
  })

  it('two fields on one key is an error naming both', () => {
    expect(() =>
      Mirror.make(App, MirrorStore.memory(), {
        fields: Projection.pick(App.fields.page, App.fields.q),
        keys: { q: { key: 'page' } },
      }),
    ).toThrow('Mirror: fields "page" and "q" both use the key "page"; give one another key')
  })
})

describe('reduce and href', () => {
  it('from a URL: the whole slice, a missing or malformed key being the initial value', () => {
    const m = mirror()
    const changed = { ...initial, filter: 'done' as const, page: 4, q: 'x', open: true }
    expect(m.reduce(changed, '/todos?filter=active&page=abc&other=1#h')).toEqual({
      ...changed,
      filter: 'active',
      page: 1,
      q: '',
    })
    expect(m.reduce(changed, '/todos')).toEqual({ ...changed, filter: 'all', page: 1, q: '' })
    // A Foldkit Url works the same.
    expect(
      m.reduce(initial, {
        protocol: 'https:',
        host: 'x',
        port: { _tag: 'None' },
        pathname: '/todos',
        search: { _tag: 'Some', value: '?q=apollo' },
        hash: { _tag: 'None' },
      } as never),
    ).toEqual({ ...initial, q: 'apollo' })
  })

  it('from the hash, when the mirror lives there', () => {
    const m = Mirror.make(App, MirrorStore.memory(), { fields: Filters, location: 'hash' } as never)
    expect(m.reduce(initial, '/todos?q=ignored#page=2')).toEqual({ ...initial, page: 2 })
    expect(m.href(initial, { page: 3 }, '/todos?q=keep')).toBe('/todos?q=keep#page=3')
  })

  it('href applies a patch to the current keys on a base, leaving the rest of the URL alone', () => {
    const m = mirror()
    expect(m.href(initial, { page: 2 }, '/todos?sort=asc&page=9#top')).toBe(
      '/todos?sort=asc&page=2#top',
    )
    expect(
      m.href({ ...initial, filter: 'active' }, { filter: 'all' }, '/todos?filter=active'),
    ).toBe('/todos')
    expect(m.href({ ...initial, q: 'a b' }, undefined, '/')).toBe('/?q=a+b')
    // Without a base and outside a browser, the root.
    expect(m.href(initial, { page: 2 })).toBe('/?page=2')
    // A key the mirror does not own is a compile error; at runtime it is ignored.
    expect(m.href(initial, { open: true } as never, '/')).toBe('/')
  })

  it('applyToHref is the pure step: set, remove, and keep everything else', () => {
    expect(applyToHref('/a?x=1&y=2#h', { set: { y: '3', z: '4' }, remove: ['x'] })).toBe(
      '/a?y=3&z=4#h',
    )
    expect(applyToHref('/a?x=1', { set: {}, remove: ['x'] })).toBe('/a')
    expect(applyToHref('/a#x=1&k=2', { set: { x: '2' }, remove: [] }, 'hash')).toBe('/a#x=2&k=2')
  })
})

describe('the write entry', () => {
  const run = <R>(
    m: ReturnType<typeof mirror>,
    model: Model,
    layer: Layer.Layer<R> = Layer.empty as never,
  ) => {
    const entry = m.subscriptions['filters.mirror']!
    return Effect.runPromise(
      Stream.runDrain(entry.dependenciesToStream(entry.modelToDependencies(model))).pipe(
        Effect.provide(layer),
      ),
    )
  }

  it('its dependencies are the encoded keys, and it writes only what changed', async () => {
    const store = MirrorStore.memory({ filter: 'active', foreign: 'kept' })
    const m = mirror(store)
    expect(m.subscriptions['filters.mirror']!.modelToDependencies({ ...initial, page: 2 })).toEqual(
      { keys: { page: '2' } },
    )
    await run(m, { ...initial, filter: 'active' })
    expect(store.writes).toEqual([])
    await run(m, { ...initial, filter: 'active', page: 2 })
    expect(store.writes).toEqual([
      { set: { filter: 'active', page: '2' }, remove: [], intent: 'push' },
    ])
    expect(store.current()).toEqual({ filter: 'active', page: '2', foreign: 'kept' })
  })

  it('pushes only for a changed key that pushes; a replace key or a removal replaces', async () => {
    const store = MirrorStore.memory({ filter: 'active', page: '2' })
    const m = mirror(store)
    await run(m, { ...initial, filter: 'active', page: 2, q: 'x' })
    expect(store.writes.at(-1)).toMatchObject({ intent: 'replace' })
    await run(m, { ...initial, filter: 'active', q: 'x' })
    expect(store.writes.at(-1)).toEqual({
      set: { filter: 'active', q: 'x' },
      remove: ['page'],
      intent: 'replace',
    })
    await run(m, { ...initial, filter: 'done', q: 'x' })
    expect(store.writes.at(-1)).toMatchObject({ intent: 'push' })
  })

  it('waits the throttle, and a newer slice supersedes a pending write', async () => {
    const store = MirrorStore.memory()
    const m = Mirror.make(App, store, { name: 'filters', fields: Filters, throttle: '100 millis' })
    const entry = m.subscriptions['filters.mirror']!
    await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* Effect.forkChild(
          Stream.runDrain(
            entry.dependenciesToStream(entry.modelToDependencies({ ...initial, page: 2 })),
          ),
        )
        yield* TestClock.adjust('50 millis')
        yield* Fiber.interrupt(first) // what Foldkit's switchMap does on a newer slice
        const second = yield* Effect.forkChild(
          Stream.runDrain(
            entry.dependenciesToStream(entry.modelToDependencies({ ...initial, page: 3 })),
          ),
        )
        yield* TestClock.adjust('99 millis')
        expect(store.writes).toEqual([])
        yield* TestClock.adjust('1 millis')
        yield* Fiber.join(second)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(store.writes).toEqual([{ set: { page: '3' }, remove: [], intent: 'push' }])
  })
})

describe('restore', () => {
  it('reads the store into a MirrorRestored that reduce applies to fields still at their initial value', async () => {
    const store = MirrorStore.memory({ filter: 'active', page: '2', q: 'saved' })
    const m = mirror(store)
    const message = await Effect.runPromise(m.restore.effect)
    expect(message).toEqual({
      _tag: 'MirrorRestored',
      name: 'filters',
      keys: { filter: 'active', page: '2', q: 'saved' },
    })
    expect(Mirror.reduces(message)).toBe(true)
    expect(Mirror.reduces(Message.Ping())).toBe(false)
    expect(Mirror.reduces({ _tag: 'toString' })).toBe(false)
    // The user typed before the store answered: the store's q is not applied.
    const typed = { ...initial, q: 'typing' }
    expect(m.reduce(typed, message)).toEqual({ ...typed, filter: 'active', page: 2 })
    // Another mirror's Message, or an empty store, changes nothing.
    expect(m.reduce(typed, { ...message, name: 'other' })).toBe(typed)
    expect(m.reduce(typed, { _tag: 'MirrorRestored', name: 'filters', keys: {} })).toEqual(typed)
    // The union's own case has the same shape.
    const viaUnion: MirrorRestored = Message.MirrorRestored({
      name: 'filters',
      keys: { page: '5' },
    })
    expect(m.reduce(initial, viaUnion)).toEqual({ ...initial, page: 5 })
  })
})

describe('the contract', () => {
  it('observes the slice, owns nothing, and Module accepts it', () => {
    const m = mirror()
    expect(m.contract).toEqual({
      kind: 'mirror',
      name: 'filters',
      owner: App.owner,
      owns: [],
      observes: [['filter'], ['page'], ['q']],
      messages: [],
      requirements: [],
    })
    expect(Module.validate(Module.make(App, [m.contract]))).toEqual([])
    expect(Module.manifest(Module.make(App, [m.contract])).ownership).toContainEqual({
      path: ['filter'],
      owner: undefined,
    })
  })

  it('a kv mirror names MirrorRestored, so Module reports a union that did not spread it', () => {
    const Prefs = Mirror.kv(App, { key: 'prefs', fields: Projection.pick(App.fields.open) })
    expect(Prefs.name).toBe('prefs')
    expect(Prefs.kind).toBe('kv')
    expect(Prefs.contract.messages).toEqual(['MirrorRestored'])
    const Bare = Surface.application({
      Model,
      Message: defineMessageUnion({ Ping: {} }),
      initial,
      update: model => ({ model }),
    })
    const Unspread = Mirror.kv(Bare, { key: 'prefs', fields: Projection.pick(Bare.fields.open) })
    expect(Module.validate(Module.make(Bare, [Unspread.contract])).map(f => f.rule)).toEqual([
      'unknown-message',
    ])
  })

  it('a URL key belongs to one mirror per application', () => {
    const A = Surface.application({ Model, Message, initial, update: model => ({ model }) })
    const first = Mirror.url(A, { name: 'first', fields: Projection.pick(A.fields.page) })
    expect(first.name).toBe('first')
    expect(Mirror.url(A, { fields: Projection.pick(A.fields.q) }).name).toBe('url(q)')
    // The same mirror declared again is fine; another taking the key is not.
    Mirror.url(A, { name: 'first', fields: Projection.pick(A.fields.page) })
    expect(() => Mirror.url(A, { name: 'second', fields: Projection.pick(A.fields.page) })).toThrow(
      'Mirror.url: key "page" in the search is already mirrored by "first"; "second" cannot mirror it too',
    )
    // Another location, or another application, is another namespace.
    Mirror.url(A, { name: 'hashed', fields: Projection.pick(A.fields.page), location: 'hash' })
    const B = Surface.application({ Model, Message, initial, update: model => ({ model }) })
    Mirror.url(B, { name: 'second', fields: Projection.pick(B.fields.page) })
  })
})
