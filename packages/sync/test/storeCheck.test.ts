import { Effect } from 'effect'
import { IDBFactory } from 'fake-indexeddb'
import { checkStore, type StoreAdapter, type StoreRow } from '@doeixd/metakit/store/check'
import { describe, expect, it } from 'vitest'
import { indexedDb, type Storage } from '../src/index.js'

interface ReplicaSnapshot {
  readonly revision: number
  readonly rows: Record<string, StoreRow>
  readonly children: ReadonlyArray<StoreRow>
}

const openReplica = (name: string, factory: IDBFactory): Promise<Storage> =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* indexedDb(name, factory)
    }).pipe(Effect.scoped),
  )

/**
 * Each connection models an offline Sync replica backed by its own IndexedDB
 * database: each replica starts from the seeded snapshot and accepts writes
 * locally without waiting for other replicas.
 */
const makeSyncReplicaAdapter = (): StoreAdapter => {
  const openStorages = new Set<Storage>()
  let replicaCount = 0

  const seedStorage = async (
    storage: Storage,
    rows: { readonly parent: StoreRow; readonly children: ReadonlyArray<StoreRow> },
  ): Promise<void> => {
    const existing = (await Effect.runPromise(storage.load())) as ReplicaSnapshot | undefined
    const expectedRevision = existing?.revision ?? null
    const nextRevision = (existing?.revision ?? 0) + 1
    await Effect.runPromise(
      storage.save(
        {
          revision: nextRevision,
          rows: { [rows.parent.id]: rows.parent },
          children: [...rows.children],
        } satisfies ReplicaSnapshot,
        expectedRevision,
      ),
    )
  }

  return {
    seed: async rows => {
      for (const storage of openStorages) {
        await seedStorage(storage, rows)
      }
    },
    connect: async () => {
      const factory = new IDBFactory()
      const name = `replica-${++replicaCount}`
      // Keep the IDB connection open for the lifetime of this StoreConnection.
      let release!: () => void
      const closed = new Promise<void>(resolve => {
        release = resolve
      })
      let storage!: Storage
      const ready = new Promise<void>((resolve, reject) => {
        void Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              storage = yield* indexedDb(name, factory)
              openStorages.add(storage)
              resolve()
              yield* Effect.promise(() => closed)
              openStorages.delete(storage)
            }),
          ),
        ).catch(reject)
      })
      await ready

      const loadSnapshot = async (): Promise<ReplicaSnapshot> =>
        (await Effect.runPromise(storage.load())) as ReplicaSnapshot

      const saveSnapshot = async (
        next: ReplicaSnapshot,
        expectedRevision: number,
      ): Promise<void> => {
        await Effect.runPromise(storage.save(next, expectedRevision))
      }

      const read = async (id: string): Promise<StoreRow | undefined> => {
        const snap = await loadSnapshot()
        return snap.rows[id]
      }

      const write = async (id: string, balance: number): Promise<void> => {
        const snap = await loadSnapshot()
        await saveSnapshot(
          {
            revision: snap.revision + 1,
            rows: { ...snap.rows, [id]: { id, balance } },
            children: snap.children,
          },
          snap.revision,
        )
      }

      const listChildren = async (parentId: string): Promise<ReadonlyArray<StoreRow>> => {
        const snap = await loadSnapshot()
        return snap.children.filter(child => child.parentId === parentId)
      }

      const addChild = async (row: StoreRow): Promise<void> => {
        const snap = await loadSnapshot()
        await saveSnapshot(
          {
            revision: snap.revision + 1,
            rows: snap.rows,
            children: [...snap.children, row],
          },
          snap.revision,
        )
      }

      return {
        read,
        write,
        transaction: run =>
          run({
            read,
            write,
            lockParent: async () => {},
            listChildren,
            addChild,
          }),
        close: async () => {
          release()
        },
      }
    },
  }
}

describe('Sync IndexedDB replica store capability probe (metakit/store/check)', () => {
  it('passes checkStore for the replica declared eventual isolation', async () => {
    const replica = await openReplica('declared-check', new IDBFactory())
    const declared = replica.store

    const report = await checkStore(declared, makeSyncReplicaAdapter())
    expect(report.store).toBe('IndexedDB replica')
    expect(report.passed).toBe(true)
    expect(report.failures).toEqual([])
  })

  it('catches a Sync replica falsely declaring serializable transaction isolation', async () => {
    const replica = await openReplica('false-serializable', new IDBFactory())
    const falseDeclared = {
      ...replica.store,
      isolation: 'serializable' as const,
      isolates: 'transaction' as const,
    }

    const report = await checkStore(falseDeclared, makeSyncReplicaAdapter())
    expect(report.passed).toBe(false)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]!.probe).toBe('serializable-transaction')
    expect(report.failures[0]!.message).toContain('"IndexedDB replica"')
  })

  it('catches a Sync replica falsely declaring parentRowLock', async () => {
    const replica = await openReplica('false-lock', new IDBFactory())
    const falseDeclared = {
      ...replica.store,
      parentRowLock: true,
    }

    const report = await checkStore(falseDeclared, makeSyncReplicaAdapter())
    expect(report.passed).toBe(false)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]!.probe).toBe('parent-row-lock')
    expect(report.failures[0]!.message).toContain('"IndexedDB replica"')
  })
})
