import { Effect, Exit, Scope } from 'effect'
import { describe, expect, it } from 'vitest'
import { ReplicaId, Sync } from '../src/index.js'
import { Message, Todos } from './fixtures/todos-contract.js'
import { memoryStorage } from './memoryStorage.js'

describe('a replica named by its store', () => {
  it('mints an id on first open and reads the same one back', async () => {
    const storage = memoryStorage()
    const first = await Effect.runPromise(Todos.openReplica(storage))
    await Effect.runPromise(first.submit(Message.CreatedTodo({ id: 't1', title: 'One' })))
    const reopened = await Effect.runPromise(Todos.openReplica(storage))

    expect(reopened.replicaId).toBe(first.replicaId)
    expect((await Effect.runPromise(reopened.status)).pending).toBe(1)
  })

  it('gives two stores two ids', async () => {
    const a = await Effect.runPromise(Todos.openReplica(memoryStorage()))
    const b = await Effect.runPromise(Todos.openReplica(memoryStorage()))

    expect(a.replicaId).not.toBe(b.replicaId)
  })

  it('takes an explicit id, and refuses one the store does not hold', async () => {
    const storage = memoryStorage()
    const named = await Effect.runPromise(
      Todos.openReplica(storage, { replicaId: ReplicaId.make('a') }),
    )
    expect(named.replicaId).toBe('a')

    const other = await Effect.runPromiseExit(
      Todos.openReplica(storage, { replicaId: ReplicaId.make('b') }),
    )
    expect(Exit.isFailure(other) && String(other.cause)).toContain('WrongReplicaStorageError')
  })
})

/** A `sessionStorage` of one tab: a reload keeps it, a duplicated tab copies it. */
const tabSession = (entries: Record<string, string> = {}) => {
  const items = new Map(Object.entries(entries))
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  }
}

/** Web Locks shared by every tab of one browser: `ifAvailable` is refused while held. */
const browserLocks = () => {
  const held = new Set<string>()
  return {
    held,
    request: (
      name: string,
      _options: { readonly ifAvailable: true },
      callback: (lock: { readonly name: string } | null) => Promise<void> | undefined,
    ): Promise<void> => {
      if (held.has(name)) return Promise.resolve(callback(null))
      held.add(name)
      return Promise.resolve(callback({ name })).finally(() => held.delete(name))
    },
  }
}

/** An IndexedDB that records the databases opened and never stores anything. */
const openedDatabases = () => {
  const names: Array<string> = []
  const factory = {
    open: (name: string) => {
      names.push(name)
      const request = {
        result: { close: () => {}, onversionchange: null },
      } as unknown as IDBOpenDBRequest
      queueMicrotask(() => request.onsuccess!(new Event('success')))
      return request
    },
  } as unknown as IDBFactory
  return { names, factory }
}

const openTab = async (
  name: string,
  dependencies: Parameters<typeof Sync.tabStorage>[1],
): Promise<Scope.Closeable> => {
  const scope = Effect.runSync(Scope.make())
  await Effect.runPromise(
    Sync.tabStorage(name, dependencies).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  return scope
}

describe('Sync.tabStorage', () => {
  it('reopens the store a reload left, under the name it was given', async () => {
    const sessionStorage = tabSession()
    const { names, factory } = openedDatabases()
    const locks = browserLocks()

    const first = await openTab('todos', { sessionStorage, locks, indexedDB: factory })
    await Effect.runPromise(Scope.close(first, Exit.void))
    await openTab('todos', { sessionStorage, locks, indexedDB: factory })

    expect(names).toHaveLength(2)
    expect(names[0]).toMatch(/^todos\/.+/)
    expect(names[1]).toBe(names[0])
    expect(names[0]).toBe(`todos/${sessionStorage.getItem('todos')}`)
  })

  it('opens a store of its own in a duplicated tab', async () => {
    const original = tabSession()
    const { names, factory } = openedDatabases()
    const locks = browserLocks()

    await openTab('todos', { sessionStorage: original, locks, indexedDB: factory })
    const duplicate = tabSession(Object.fromEntries(original.items))
    await openTab('todos', { sessionStorage: duplicate, locks, indexedDB: factory })

    expect(names[1]).not.toBe(names[0])
    expect(names[1]).toBe(`todos/${duplicate.getItem('todos')}`)
  })

  it('keeps its key where the page may not take a lock', async () => {
    const sessionStorage = tabSession()
    const { names, factory } = openedDatabases()
    const locks = {
      request: () => Promise.reject(new DOMException('opaque origin', 'SecurityError')),
    }

    await openTab('todos', { sessionStorage, locks, indexedDB: factory })
    await openTab('todos', { sessionStorage, locks, indexedDB: factory })

    expect(names[1]).toBe(names[0])
  })

  it('keeps one key per name', async () => {
    const sessionStorage = tabSession()
    const { names, factory } = openedDatabases()

    await openTab('a', { sessionStorage, locks: undefined, indexedDB: factory })
    await openTab('b', { sessionStorage, locks: undefined, indexedDB: factory })

    expect(names[0]!.slice('a/'.length)).not.toBe(names[1]!.slice('b/'.length))
  })
})
