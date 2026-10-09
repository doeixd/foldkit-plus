// @vitest-environment node
/**
 * The list kept in the browser. A snapshot is the server's rows for one actor.
 * A pending edit is not in it, and another actor's snapshot does not paint.
 */
import { Option } from 'effect'
import { ConnectionChange, Remote, RemoteData, entityKey } from 'foldkit-remote'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyCache, Data, initial, modelFromCache, Todos, type Model } from '../src/app.js'
import { cacheKey, LIST_WATCH, snapshotFor, snapshotText } from '../src/cache.js'
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

describe('snapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('paints a stored page as a stale list', () => {
    const loaded = pageOf(initial('ada'), [{ id: 'milk', title: 'Milk', done: 0 }])
    const restored = modelFromCache(initial('ada'), snapshotText(loaded.remote, 'ada'))
    expect(Todos.page(restored)._tag).toBe('Refreshing')
    expect(titles(restored)).toEqual(['Milk'])
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

  it('refuses another actor', () => {
    const loaded = pageOf(initial('ada'), [{ id: 'milk', title: 'Milk', done: 0 }])
    const grace = initial('grace')
    expect(modelFromCache(grace, snapshotText(loaded.remote, 'ada'))).toBe(grace)
    expect(Todos.page(grace)._tag).toBe('Initial')
  })

  it('keeps the rows when the refetch fails', () => {
    const loaded = pageOf(initial('ada'), [{ id: 'milk', title: 'Milk', done: 0 }])
    const restored = modelFromCache(initial('ada'), snapshotText(loaded.remote, 'ada'))
    const failed = Data.reduce(restored, {
      _tag: 'QueryFailed',
      connection: AllTodos.ref({}).identity,
      error: { _tag: 'RemoteQueryError', message: 'offline' },
    })
    expect(Todos.page(failed)._tag).toBe('Failed')
    expect(titles(failed)).toEqual(['Milk'])
  })

  it('stores an empty page as one empty segment', () => {
    const loaded = pageOf(initial('ada'), [])
    expect(snapshotFor(loaded.remote).connections[AllTodos.ref({}).identity]).toEqual([[]])
    const restored = modelFromCache(initial('ada'), snapshotText(loaded.remote, 'ada'))
    expect(Todos.page(restored)._tag).toBe('Refreshing')
    expect(titles(restored)).toEqual([])
  })

  it('removes a snapshot the actor cannot read', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })
    const loaded = pageOf(initial('ada'), [{ id: 'milk', title: 'Milk', done: 0 }])
    store.set(cacheKey('grace'), snapshotText(loaded.remote, 'ada'))
    const grace = initial('grace')
    expect(applyCache(grace)).toBe(grace)
    expect(store.has(cacheKey('grace'))).toBe(false)
  })
})
