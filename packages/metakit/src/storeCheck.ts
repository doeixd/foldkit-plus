/**
 * Store capability probe kit (`metakit/store/check`, Phase 9 Bout 9.3).
 *
 * A test-only entry that opens two connections against a store adapter and
 * races concurrent writers to verify that what the adapter declares in
 * `StoreCapabilities` actually holds at runtime. No server main imports this.
 */
import type { StoreCapabilities } from './store.js'

export interface StoreRow {
  readonly id: string
  readonly balance: number
  readonly parentId?: string | undefined
}

export interface StoreTx {
  readonly read: (id: string) => Promise<StoreRow | undefined>
  readonly write: (id: string, balance: number) => Promise<void>
  readonly lockParent?: ((parentId: string) => Promise<void>) | undefined
  readonly listChildren?: ((parentId: string) => Promise<ReadonlyArray<StoreRow>>) | undefined
  readonly addChild?: ((row: StoreRow) => Promise<void>) | undefined
}

export interface StoreConnection {
  readonly transaction: <A>(run: (tx: StoreTx) => Promise<A>) => Promise<A>
  readonly read: (id: string) => Promise<StoreRow | undefined>
  readonly write: (id: string, balance: number) => Promise<void>
  readonly close?: (() => Promise<void>) | undefined
}

export interface StoreAdapter {
  readonly connect: () => Promise<StoreConnection>
  readonly seed: (rows: {
    readonly parent: StoreRow
    readonly children: ReadonlyArray<StoreRow>
  }) => Promise<void>
}

export interface StoreProbeFailure {
  readonly probe: 'serializable-transaction' | 'parent-row-lock'
  readonly message: string
}

export interface StoreReport {
  readonly store: string
  readonly passed: boolean
  readonly runs: number
  readonly failures: ReadonlyArray<StoreProbeFailure>
}

const yieldTick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const makeBarrier = (count: number) => {
  let arrived = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  return async (): Promise<void> => {
    arrived += 1
    if (arrived >= count) {
      release()
      return
    }
    // Never deadlock a truly serialized store where writer 2 waits on writer 1's lock.
    await Promise.race([gate, yieldTick()])
  }
}

/**
 * Probe `adapter` against its `declared` `StoreCapabilities`.
 *
 * Opens two connections per run and races concurrent writers:
 * - When `isolation === 'serializable'` and `isolates === 'transaction'`,
 *   two writers read balance 10 and each subtract 5; if both succeed and leave
 *   balance 5, the second write did not see the first.
 * - When `parentRowLock === true`, two writers lock the parent row, sum its
 *   children, and insert a child of 6 if total + 6 <= 10; if both succeed and
 *   leave total 12, writers of one parent ran concurrently.
 */
export const checkStore = async (
  declared: StoreCapabilities,
  adapter: StoreAdapter,
  options?: { readonly runs?: number },
): Promise<StoreReport> => {
  const runs = options?.runs ?? 3
  const failures: Array<StoreProbeFailure> = []

  const checkSerializableTx =
    declared.isolation === 'serializable' && declared.isolates === 'transaction'

  for (let run = 0; run < runs; run++) {
    const c1 = await adapter.connect()
    const c2 = await adapter.connect()
    try {
      if (checkSerializableTx) {
        await adapter.seed({
          parent: { id: 'p1', balance: 10 },
          children: [],
        })
        const barrier = makeBarrier(2)
        const observed: Array<number> = []
        const writer = (conn: StoreConnection) =>
          conn
            .transaction(async tx => {
              const row = await tx.read('p1')
              const bal = row?.balance ?? 0
              observed.push(bal)
              await barrier()
              await tx.write('p1', bal - 5)
              return true
            })
            .catch(() => false)

        const [ok1, ok2] = await Promise.all([writer(c1), writer(c2)])
        const after = await c1.read('p1')
        if (ok1 && ok2 && after !== undefined && after.balance === 5) {
          failures.push({
            probe: 'serializable-transaction',
            message: `[metakit/store] "${declared.name}" declares serializable over a transaction, and two writers each read balance 10 and wrote 5: the second write did not see the first. Declare read-committed, or isolate the round trips.`,
          })
          break
        }
      }

      if (declared.parentRowLock) {
        await adapter.seed({
          parent: { id: 'p1', balance: 10 },
          children: [],
        })
        const barrier = makeBarrier(2)
        const writer = (conn: StoreConnection, childId: string) =>
          conn
            .transaction(async tx => {
              if (tx.lockParent !== undefined) await tx.lockParent('p1')
              if (tx.listChildren === undefined || tx.addChild === undefined) return false
              const children = await tx.listChildren('p1')
              const sum = children.reduce((acc, r) => acc + r.balance, 0)
              await barrier()
              if (sum + 6 <= 10) {
                await tx.addChild({ id: childId, parentId: 'p1', balance: 6 })
                return true
              }
              return false
            })
            .catch(() => false)

        const [ok1, ok2] = await Promise.all([writer(c1, 'c1'), writer(c2, 'c2')])
        if (ok1 && ok2) {
          failures.push({
            probe: 'parent-row-lock',
            message: `[metakit/store] "${declared.name}" declares parentRowLock, and two writers each read children total 0 and added 6 (final total 12 > 10): writers of one parent ran concurrently. Declare parentRowLock: false, or lock the parent row.`,
          })
          break
        }
      }
    } finally {
      if (c1.close !== undefined) await c1.close()
      if (c2.close !== undefined) await c2.close()
    }
  }

  return {
    store: declared.name,
    passed: failures.length === 0,
    runs,
    failures,
  }
}
