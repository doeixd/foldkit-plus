import { Option, Result, Schema } from 'effect'
import * as Rows from 'metakit/aggregates'
import * as Temporal from 'metakit/temporal'
import { describe, expect, it } from 'vitest'

const LedgerRow = Schema.Struct({
  accountId: Schema.String,
  delta: Schema.Int,
})

const balanceSum = Rows.sum(LedgerRow, $ => $.delta)
const maxDelta = Rows.max(LedgerRow, $ => $.delta)

describe('metakit/temporal (store capability refusals & walk interleaving obligations)', () => {
  it('refuses at setup time to mount cross-row aggregate invariants on incapable stores', () => {
    const eventualStore: Temporal.StoreCapabilities = {
      name: 'kv-eventual',
      supportsParentRowLock: false,
      isolation: 'eventual',
    }
    const unlockedReadCommitted: Temporal.StoreCapabilities = {
      name: 'pg-no-lock',
      supportsParentRowLock: false,
      isolation: 'read-committed',
    }
    const lockedReadCommitted: Temporal.StoreCapabilities = {
      name: 'pg-select-for-update',
      supportsParentRowLock: true,
      isolation: 'read-committed',
    }
    const serializableStore: Temporal.StoreCapabilities = {
      name: 'sqlite-serializable',
      supportsParentRowLock: false,
      isolation: 'serializable',
    }

    const sumReq: Temporal.CrossRowRequirement = {
      id: 'account-balance-conservation',
      kind: 'group-aggregate',
      aggregate: balanceSum,
    }
    const maxReq: Temporal.CrossRowRequirement = {
      id: 'account-max-entry',
      kind: 'semilattice-aggregate',
      aggregate: maxDelta,
    }

    // Eventual store fails both locking and isolation checks
    const eventualRes = Temporal.checkStoreCapabilities(eventualStore, [sumReq])
    expect(Result.isFailure(eventualRes)).toBe(true)
    if (Result.isFailure(eventualRes)) {
      expect(eventualRes.failure.violations.length).toBe(2)
      expect(eventualRes.failure.violations[0]!.obligation.kind).toBe('store-capability')
    }

    // Unlocked read-committed store cannot enforce cross-row sum: throws loudly at setup
    expect(() => Temporal.assertStoreCapabilities(unlockedReadCommitted, [sumReq])).toThrow(
      /cannot satisfy cross-row requirements/,
    )

    // Locked read-committed store satisfies group-aggregate (Rows.sum)
    expect(() => Temporal.assertStoreCapabilities(lockedReadCommitted, [sumReq])).not.toThrow()

    // Locked read-committed store refuses semilattice-aggregate (requires repeatable-read)
    expect(() => Temporal.assertStoreCapabilities(lockedReadCommitted, [maxReq])).toThrow(
      /repeatable-read/,
    )

    // Serializable store satisfies both without explicit parent-row lock
    expect(() =>
      Temporal.assertStoreCapabilities(serializableStore, [sumReq, maxReq]),
    ).not.toThrow()
  })

  it('emits Obligation(kind: "walk") and discharges them via deterministic seeded interleaving walks', () => {
    const obligations = Temporal.emitWalkObligations([
      { tag: 'EditNote', concurrency: 'latest', optimistic: true },
      { tag: 'DeleteNote', concurrency: 'optimistic-rollback' },
    ])
    expect(obligations.length).toBe(3)
    expect(obligations.every(o => o.kind === 'walk')).toBe(true)

    interface NoteClient {
      readonly committed: string
      readonly visible: string
      readonly latestSentSeq: number
      readonly latestCommittedSeq: number
      readonly pending: ReadonlyArray<{ readonly seq: number; readonly title: string }>
    }

    const runProtocol = (suppressStale: boolean) =>
      Temporal.runWalk<NoteClient, string, string>({
        seed: 20261120,
        randomRuns: 25,
        obligations,
        initial: () => ({
          committed: 'Initial',
          visible: 'Initial',
          latestSentSeq: -1,
          latestCommittedSeq: -1,
          pending: [],
        }),
        actions: ['First edit', 'Second edit', 'Third edit'],
        send: (state, seq, title) => ({
          ...state,
          visible: title,
          latestSentSeq: Math.max(state.latestSentSeq, seq),
          pending: [...state.pending, { seq, title }],
        }),
        serverResult: (_seq, title) => title,
        onResponse: (state, seq, response) => {
          // Stale-response guard: ignore responses older than already-committed seq
          if (suppressStale && seq < state.latestCommittedSeq) {
            return { ...state, pending: state.pending.filter(p => p.seq !== seq) }
          }
          const nextCommitted = response
          const nextCommittedSeq = Math.max(state.latestCommittedSeq, seq)
          const remaining = suppressStale
            ? state.pending.filter(p => p.seq > nextCommittedSeq)
            : state.pending.filter(p => p.seq !== seq)
          const newestPending = remaining[remaining.length - 1]
          return {
            committed: nextCommitted,
            visible: newestPending !== undefined ? newestPending.title : nextCommitted,
            latestSentSeq: state.latestSentSeq,
            latestCommittedSeq: nextCommittedSeq,
            pending: remaining,
          }
        },
        onReject: (state, seq) => {
          const remaining = state.pending.filter(p => p.seq !== seq)
          const newestPending = remaining[remaining.length - 1]
          return {
            ...state,
            visible: newestPending !== undefined ? newestPending.title : state.committed,
            pending: remaining,
          }
        },
        invariant: (state, history) => {
          // Once a newer edit has been sent or committed, a stale response from an older seq
          // must never make `visible` regress to that older title.
          const lastEv = history[history.length - 1]
          if (
            lastEv !== undefined &&
            lastEv.kind === 'respond' &&
            lastEv.seq < state.latestSentSeq
          ) {
            const newerPendingOrCommitted = history.some(
              e =>
                (e.kind === 'send' || e.kind === 'respond') &&
                e.seq > lastEv.seq &&
                e.kind === 'respond',
            )
            if (newerPendingOrCommitted && state.visible === lastEv.response) {
              return Option.some(
                `stale response seq=${lastEv.seq} ("${lastEv.response}") overwrote newer state`,
              )
            }
          }
          return Option.none()
        },
        finalCheck: (state, history) => {
          // After all events settle, visible must equal the highest-seq accepted response (or Initial)
          let bestSeq = -1
          let expected = 'Initial'
          for (const ev of history) {
            if (ev.kind === 'respond' && ev.seq > bestSeq) {
              bestSeq = ev.seq
              expected = ev.response
            }
          }
          if (state.visible !== expected) {
            return Option.some(`expected final visible="${expected}", got "${state.visible}"`)
          }
          return Option.none()
        },
      })

    // Correct client passes every adversarial + seeded schedule and discharges all obligations
    const good = runProtocol(true)
    expect(good.ok).toBe(true)
    expect(good.scenariosRun).toBe(29)
    expect(good.discharged).toEqual(obligations)
    expect(Option.isNone(good.failure)).toBe(true)

    // Buggy client (without stale-response suppression) is caught on the very first schedule!
    const bad = runProtocol(false)
    expect(bad.ok).toBe(false)
    expect(Option.isSome(bad.failure)).toBe(true)
    if (Option.isSome(bad.failure)) {
      expect(bad.failure.value.scenario).toBe('out-of-order-stale-response')
      expect(bad.failure.value.reason).toContain('stale response')
    }
  })
})
