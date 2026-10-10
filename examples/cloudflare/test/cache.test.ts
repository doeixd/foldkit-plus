// @vitest-environment node
/**
 * The list kept in the browser. A snapshot is the server's rows for one actor.
 * A pending edit is not in it, and another actor's snapshot does not paint.
 */
import { Effect, Option, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { ConnectionChange, Remote, RemoteData, RemotePersistence, entityKey } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { Data, initial, persistence, Todos, type Model } from '../src/app.js'
import { cacheKey, LIST_WATCH, snapshotFor } from '../src/cache.js'
import { Todo } from '../src/domain.js'
import { AllTodos, CreateTodo } from '../src/operations.js'

const select = { entity: 'Todo', fields: ['id', 'title', 'done'] } as const

const pageOf = (
  model: Model,
  rows: ReadonlyArray<{ readonly id: string; readonly title: string; readonly done: 0 | 1 }>,
): Model =>
  Data.reduce(
    model,
    Remote.queryMessage(
      AllTodos.ref({}),
      {
        edges: rows.map(row => ({ entity: 'Todo', id: row.id, key: `Todo:${row.id}` })),
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
        entities: rows.map(row => ({ entity: 'Todo', id: row.id, values: { ...row } })),
      },
      select,
    ),
  )

const titles = (model: Model): ReadonlyArray<string> =>
  RemoteData.match(Todos.page(model), {
    Initial: () => [],
    Loading: () => [],
    NotFound: () => [],
    Ready: page => page.items.map(row => row.title),
    Refreshing: page => page.items.map(row => row.title),
    Failed: (_error, previous) =>
      Option.match(previous, {
        onNone: () => [],
        onSome: page => page.items.map(row => row.title),
      }),
  })

const edgeIds = (model: Model): ReadonlyArray<string> => {
  const segments = snapshotFor(model.remote).connections[AllTodos.ref({}).identity] ?? []
  return segments.flatMap(segment => segment.map(edge => edge.ref.id))
}

const succeed = (model: Model, requestId: string, id: string, title: string): Model =>
  Data.reduce(model, {
    _tag: 'MutationSucceeded',
    requestId,
    entities: [{ entity: 'Todo', id, values: { id, title, done: 0 } }],
    connections: [ConnectionChange.prepend(AllTodos.ref({}), Remote.ref(Todo, id))],
    now: 1,
  })

/** A browser store holding each actor's snapshot of `loaded`, under the key `key` names. */
const storeWith = (
  stored: ReadonlyArray<{ readonly key: string; readonly actor: string; readonly loaded: Model }>,
): KeyValueStore.KeyValueStore =>
  Effect.runSync(
    Effect.gen(function* () {
      for (const { key, actor, loaded } of stored) {
        yield* RemotePersistence.save(snapshotFor(loaded.remote), { key, scope: actor })
      }
      return yield* KeyValueStore.KeyValueStore
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

/** What the page's persistence wiring restores into `model` from `kv`. */
const restored = async (kv: KeyValueStore.KeyValueStore, model: Model): Promise<Model> => {
  const restore = persistence.subscriptions!['persistence.restore']!
  const dependencies = restore.modelToDependencies(model)
  const messages = await Effect.runPromise(
    Stream.runCollect(restore.dependenciesToStream(dependencies, () => dependencies)).pipe(
      Effect.provideService(KeyValueStore.KeyValueStore, kv),
    ),
  )
  return [...messages].reduce(Data.reduce, model)
}

/** What the page's persistence wiring saves of `model` into `kv`, after its debounce. */
const saved = async (kv: KeyValueStore.KeyValueStore, model: Model): Promise<void> => {
  const save = persistence.subscriptions!['persistence.save']!
  const dependencies = save.modelToDependencies(model)
  await Effect.runPromise(
    Stream.runDrain(save.dependenciesToStream(dependencies, () => dependencies)).pipe(
      Effect.provideService(KeyValueStore.KeyValueStore, kv),
    ),
  )
}

const milk = (actor: string) => pageOf(initial(actor), [{ id: 'milk', title: 'Milk', done: 0 }])
const own = (actor: string, loaded: Model) => ({ key: cacheKey(actor), actor, loaded })

describe('snapshot', () => {
  it('paints a stored page as a stale list', async () => {
    const model = await restored(storeWith([own('ada', milk('ada'))]), initial('ada'))
    expect(Todos.page(model)._tag).toBe('Refreshing')
    expect(titles(model)).toEqual(['Milk'])
  })

  it('paints a stored page that arrives after the list was asked for', async () => {
    const asked = Data.reduce(initial('ada'), {
      _tag: 'QueryStarted',
      connections: [AllTodos.ref({}).identity],
    })
    expect(titles(await restored(storeWith([own('ada', milk('ada'))]), asked))).toEqual(['Milk'])
  })

  it('leaves a pending insert out', () => {
    const loaded = pageOf(initial('ada'), [{ id: 'milk', title: 'Milk', done: 0 }])
    const started = Data.mutate(
      loaded,
      CreateTodo,
      { id: 'pending', title: 'Pending' },
      {
        requestId: 'req-pending',
        optimistic: [
          Remote.patch(Todo, 'pending', { id: 'pending', title: 'Pending', done: 0 }),
          ConnectionChange.prepend(AllTodos.ref({}), Remote.ref(Todo, 'pending')),
        ],
      },
    )
    expect(edgeIds(started.model)).not.toContain('pending')
    expect(edgeIds(started.model)).toContain('milk')
  })

  it('keeps a confirmed insert, which lives in an overlay', () => {
    const loaded = pageOf(initial('ada'), [{ id: 'milk', title: 'Milk', done: 0 }])
    const started = Data.mutate(
      loaded,
      CreateTodo,
      { id: 'confirmed', title: 'Confirmed' },
      {
        requestId: 'req-confirmed',
        optimistic: [
          Remote.patch(Todo, 'confirmed', { id: 'confirmed', title: 'Confirmed', done: 0 }),
          ConnectionChange.prepend(AllTodos.ref({}), Remote.ref(Todo, 'confirmed')),
        ],
      },
    )
    const confirmed = succeed(started.model, 'req-confirmed', 'confirmed', 'Confirmed')
    expect(edgeIds(confirmed)).toContain('confirmed')
  })

  it('omits a tombstoned row', () => {
    const loaded = pageOf(initial('ada'), [{ id: 'milk', title: 'Milk', done: 0 }])
    const deleted = Data.reduce(loaded, {
      _tag: 'MutationSucceeded',
      requestId: 'req-deleted',
      entities: [],
      deleted: [{ entity: 'Todo', id: 'milk' }],
      now: 1,
    })
    expect(edgeIds(deleted)).not.toContain('milk')
  })

  it('drops the watch sentinel', () => {
    const loaded = pageOf(initial('ada'), [{ id: 'milk', title: 'Milk', done: 0 }])
    const started = Data.mutate(
      loaded,
      CreateTodo,
      { id: LIST_WATCH, title: 'Watch' },
      {
        requestId: 'req-watch',
        optimistic: [
          Remote.patch(Todo, LIST_WATCH, { id: LIST_WATCH, title: 'Watch', done: 0 }),
          ConnectionChange.prepend(AllTodos.ref({}), Remote.ref(Todo, LIST_WATCH)),
        ],
      },
    )
    const watched = succeed(started.model, 'req-watch', LIST_WATCH, 'Watch')
    expect(snapshotFor(watched.remote).entities[entityKey('Todo', LIST_WATCH)]).toBeUndefined()
    expect(edgeIds(watched)).not.toContain(LIST_WATCH)
    expect(edgeIds(watched)).toContain('milk')
  })

  it('keeps the page it saved for the next visit', async () => {
    const kv = storeWith([])
    const visit = await restored(kv, initial('ada'))
    await saved(kv, pageOf(visit, [{ id: 'milk', title: 'Milk', done: 0 }]))
    expect(titles(await restored(kv, initial('ada')))).toEqual(['Milk'])
  })

  it('paints each actor their own snapshot', async () => {
    const tea = pageOf(initial('grace'), [{ id: 'tea', title: 'Tea', done: 0 }])
    const kv = storeWith([own('ada', milk('ada')), own('grace', tea)])
    expect(titles(await restored(kv, initial('grace')))).toEqual(['Tea'])
  })

  it('refuses and removes another actor’s snapshot stored under this actor', async () => {
    const kv = storeWith([{ key: cacheKey('grace'), actor: 'ada', loaded: milk('ada') }])
    const grace = await restored(kv, initial('grace'))
    expect(Todos.page(grace)._tag).toBe('Initial')
    expect(await Effect.runPromise(kv.has(cacheKey('grace')))).toBe(false)
  })

  it('keeps the rows when the refetch fails', async () => {
    const model = await restored(storeWith([own('ada', milk('ada'))]), initial('ada'))
    const failed = Data.reduce(model, {
      _tag: 'QueryFailed',
      connection: AllTodos.ref({}).identity,
      error: { _tag: 'RemoteQueryError', message: 'offline' },
    })
    expect(Todos.page(failed)._tag).toBe('Failed')
    expect(titles(failed)).toEqual(['Milk'])
  })

  it('stores an empty page as one empty segment', async () => {
    const loaded = pageOf(initial('ada'), [])
    expect(snapshotFor(loaded.remote).connections[AllTodos.ref({}).identity]).toEqual([[]])
    const model = await restored(storeWith([own('ada', loaded)]), initial('ada'))
    expect(Todos.page(model)._tag).toBe('Refreshing')
    expect(titles(model)).toEqual([])
  })
})
