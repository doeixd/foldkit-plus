/**
 * Store capability probe kit (`metakit/store/check`, Phase 9 Bout 9.3).
 *
 * A test-only entry that opens two connections against a store adapter and
 * races concurrent writers to verify that what the adapter declares in
 * `StoreCapabilities` actually holds at runtime. No server main imports this.
 */
import { Deferred, Effect, Ref, type Scope } from 'effect'
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

export interface EffectStoreTx<E = unknown> {
  readonly read: (id: string) => Effect.Effect<StoreRow | undefined, E>
  readonly write: (id: string, balance: number) => Effect.Effect<void, E>
  readonly lockParent?: ((parentId: string) => Effect.Effect<void, E>) | undefined
  readonly listChildren?:
    | ((parentId: string) => Effect.Effect<ReadonlyArray<StoreRow>, E>)
    | undefined
  readonly addChild?: ((row: StoreRow) => Effect.Effect<void, E>) | undefined
}

export interface EffectStoreConnection<E = unknown> {
  readonly transaction: <A, E2>(
    run: (tx: EffectStoreTx<E>) => Effect.Effect<A, E2>,
  ) => Effect.Effect<A, E | E2>
  readonly read: (id: string) => Effect.Effect<StoreRow | undefined, E>
  readonly write: (id: string, balance: number) => Effect.Effect<void, E>
}

export interface EffectStoreAdapter<E = unknown, R = never> {
  readonly connect: Effect.Effect<EffectStoreConnection<E>, E, Scope.Scope | R>
  readonly seed: (rows: {
    readonly parent: StoreRow
    readonly children: ReadonlyArray<StoreRow>
  }) => Effect.Effect<void, E, R>
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

const makeEffectBarrier = (count: number): Effect.Effect<Effect.Effect<void>> =>
  Effect.gen(function* () {
    const arrived = yield* Ref.make(0)
    const gate = yield* Deferred.make<void>()
    return Effect.gen(function* () {
      const next = yield* Ref.updateAndGet(arrived, n => n + 1)
      if (next >= count) {
        yield* Deferred.succeed(gate, undefined)
        return
      }
      // Never deadlock a truly serialized store where writer 2 waits on writer 1's lock.
      yield* Effect.race(Deferred.await(gate), Effect.sleep(0))
    })
  })

/**
 * Effect-native store capability probe: opens two `Scope`-managed connections
 * per run and races concurrent writers against `declared` `StoreCapabilities`.
 */
export const checkStoreEffect = <E, R>(
  declared: StoreCapabilities,
  adapter: EffectStoreAdapter<E, R>,
  options?: { readonly runs?: number },
): Effect.Effect<StoreReport, E, R> =>
  Effect.gen(function* () {
    const runs = options?.runs ?? 3
    const failures: Array<StoreProbeFailure> = []
    const checkSerializableTx =
      declared.isolation === 'serializable' && declared.isolates === 'transaction'

    for (let run = 0; run < runs; run++) {
      const broke = yield* Effect.scoped(
        Effect.gen(function* () {
          const c1 = yield* adapter.connect
          const c2 = yield* adapter.connect

          if (checkSerializableTx) {
            yield* adapter.seed({
              parent: { id: 'p1', balance: 10 },
              children: [],
            })
            const barrier = yield* makeEffectBarrier(2)
            const writer = (conn: EffectStoreConnection<E>) =>
              conn
                .transaction(tx =>
                  Effect.gen(function* () {
                    const row = yield* tx.read('p1')
                    const bal = row?.balance ?? 0
                    yield* barrier
                    yield* tx.write('p1', bal - 5)
                    return true
                  }),
                )
                .pipe(Effect.catch(() => Effect.succeed(false)))

            const [ok1, ok2] = yield* Effect.all([writer(c1), writer(c2)], {
              concurrency: 'unbounded',
            })
            const after = yield* c1.read('p1')
            if (ok1 && ok2 && after !== undefined && after.balance === 5) {
              failures.push({
                probe: 'serializable-transaction',
                message: `[metakit/store] "${declared.name}" declares serializable over a transaction, and two writers each read balance 10 and wrote 5: the second write did not see the first. Declare read-committed, or isolate the round trips.`,
              })
              return true
            }
          }

          if (declared.parentRowLock) {
            yield* adapter.seed({
              parent: { id: 'p1', balance: 10 },
              children: [],
            })
            const barrier = yield* makeEffectBarrier(2)
            const writer = (conn: EffectStoreConnection<E>, childId: string) =>
              conn
                .transaction(tx =>
                  Effect.gen(function* () {
                    if (tx.lockParent !== undefined) yield* tx.lockParent('p1')
                    if (tx.listChildren === undefined || tx.addChild === undefined) return false
                    const children = yield* tx.listChildren('p1')
                    const sum = children.reduce((acc, r) => acc + r.balance, 0)
                    yield* barrier
                    if (sum + 6 <= 10) {
                      yield* tx.addChild({ id: childId, parentId: 'p1', balance: 6 })
                      return true
                    }
                    return false
                  }),
                )
                .pipe(Effect.catch(() => Effect.succeed(false)))

            const [ok1, ok2] = yield* Effect.all([writer(c1, 'c1'), writer(c2, 'c2')], {
              concurrency: 'unbounded',
            })
            if (ok1 && ok2) {
              failures.push({
                probe: 'parent-row-lock',
                message: `[metakit/store] "${declared.name}" declares parentRowLock, and two writers each read children total 0 and added 6 (final total 12 > 10): writers of one parent ran concurrently. Declare parentRowLock: false, or lock the parent row.`,
              })
              return true
            }
          }
          return false
        }),
      )
      if (broke) break
    }

    return {
      store: declared.name,
      passed: failures.length === 0,
      runs,
      failures,
    }
  })

const liftTx = (tx: StoreTx): EffectStoreTx<unknown> => ({
  read: id => Effect.tryPromise({ try: () => tx.read(id), catch: cause => cause }),
  write: (id, balance) =>
    Effect.tryPromise({ try: () => tx.write(id, balance), catch: cause => cause }),
  ...(tx.lockParent === undefined
    ? {}
    : {
        lockParent: parentId =>
          Effect.tryPromise({ try: () => tx.lockParent!(parentId), catch: cause => cause }),
      }),
  ...(tx.listChildren === undefined
    ? {}
    : {
        listChildren: parentId =>
          Effect.tryPromise({ try: () => tx.listChildren!(parentId), catch: cause => cause }),
      }),
  ...(tx.addChild === undefined
    ? {}
    : {
        addChild: row => Effect.tryPromise({ try: () => tx.addChild!(row), catch: cause => cause }),
      }),
})

const liftAdapter = (adapter: StoreAdapter): EffectStoreAdapter<unknown> => ({
  connect: Effect.acquireRelease(
    Effect.tryPromise({ try: () => adapter.connect(), catch: cause => cause }),
    conn =>
      conn.close === undefined
        ? Effect.void
        : Effect.promise(() => conn.close!()).pipe(Effect.ignore),
  ).pipe(
    Effect.map((conn): EffectStoreConnection<unknown> => ({
      transaction: run =>
        Effect.tryPromise({
          try: () => conn.transaction(tx => Effect.runPromise(run(liftTx(tx)))),
          catch: cause => cause,
        }),
      read: id => Effect.tryPromise({ try: () => conn.read(id), catch: cause => cause }),
      write: (id, balance) =>
        Effect.tryPromise({ try: () => conn.write(id, balance), catch: cause => cause }),
    })),
  ),
  seed: rows => Effect.tryPromise({ try: () => adapter.seed(rows), catch: cause => cause }),
})

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
export const checkStore = (
  declared: StoreCapabilities,
  adapter: StoreAdapter,
  options?: { readonly runs?: number },
): Promise<StoreReport> =>
  Effect.runPromise(checkStoreEffect(declared, liftAdapter(adapter), options))
