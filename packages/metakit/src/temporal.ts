/**
 * Temporal and concurrency obligation layer (`metakit/temporal`).
 *
 * Single-step proving (Tiers 3–4) stops at the network and transaction
 * boundary. This module covers the protocol layer above Tier 4:
 *   1. Setup-time store capability refusals (`checkStoreCapabilities`,
 *      `assertStoreCapabilities`) — refuse to mount cross-row aggregate
 *      invariants on stores that lack parent-row locking or required isolation.
 *   2. Interleaving obligations (`emitWalkObligations`) and a deterministic
 *      seeded interleaving harness (`runWalk`) discharging `Obligation(kind: 'walk')`
 *      for optimistic / async protocols (out-of-order responses, rollback,
 *      stale-response suppression).
 */
import { Data, Option, Result } from 'effect'
import type * as Verdict from './verdict.js'

export type IsolationLevel = 'eventual' | 'read-committed' | 'repeatable-read' | 'serializable'

const ISOLATION_RANK: Readonly<Record<IsolationLevel, number>> = {
  eventual: 0,
  'read-committed': 1,
  'repeatable-read': 2,
  serializable: 3,
}

/** Capabilities declared by a persistence store or adapter at mount time. */
export interface StoreCapabilities {
  readonly name: string
  readonly supportsParentRowLock: boolean
  readonly isolation: IsolationLevel
  readonly supportsAtomicCompareAndSwap?: boolean
}

/** A cross-row or aggregate consistency requirement declared by a domain/transition. */
export interface CrossRowRequirement {
  readonly id: string
  readonly kind: 'group-aggregate' | 'semilattice-aggregate' | 'multi-row-invariant'
  readonly aggregate?: {
    readonly algebra: 'group' | 'semilattice'
    readonly requiresRescanOnDelete: boolean
  }
  readonly requiresParentRowLock?: boolean
  readonly minIsolation?: IsolationLevel
}

export interface CapabilityViolation {
  readonly requirementId: string
  readonly reason: string
  readonly obligation: Verdict.Obligation
}

export class StoreCapabilityError extends Data.TaggedError('StoreCapabilityError')<{
  readonly store: string
  readonly violations: ReadonlyArray<CapabilityViolation>
}> {
  override get message(): string {
    const lines = this.violations.map(v => `  - [${v.requirementId}] ${v.reason}`)
    return `[metakit] Store "${this.store}" cannot satisfy cross-row requirements:\n${lines.join('\n')}`
  }
}

const defaultMinIsolation = (req: CrossRowRequirement): IsolationLevel => {
  if (req.minIsolation !== undefined) return req.minIsolation
  if (req.kind === 'semilattice-aggregate' || req.aggregate?.requiresRescanOnDelete === true) {
    return 'repeatable-read'
  }
  return 'read-committed'
}

/**
 * Verify that `store` satisfies every `CrossRowRequirement`.
 *
 * A cross-row aggregate invariant (e.g. `Rows.sum` balance conservation) needs
 * either parent-row locking OR `serializable` isolation, plus at least the
 * requirement's minimum isolation level.
 */
export const checkStoreCapabilities = (
  store: StoreCapabilities,
  requirements: ReadonlyArray<CrossRowRequirement>,
): Result.Result<void, StoreCapabilityError> => {
  const violations: Array<CapabilityViolation> = []

  for (const req of requirements) {
    const needsLock = req.requiresParentRowLock ?? true
    const minIso = defaultMinIsolation(req)

    if (needsLock && !store.supportsParentRowLock && store.isolation !== 'serializable') {
      const reason = `requires parent-row locking (or serializable isolation) for ${req.kind}, but "${store.name}" has supportsParentRowLock=false and isolation="${store.isolation}"`
      violations.push({
        requirementId: req.id,
        reason,
        obligation: { kind: 'store-capability', detail: `${req.id}: ${reason}` },
      })
    }

    if (ISOLATION_RANK[store.isolation] < ISOLATION_RANK[minIso]) {
      const reason = `requires isolation >= "${minIso}" for ${req.kind}, but "${store.name}" provides "${store.isolation}"`
      violations.push({
        requirementId: req.id,
        reason,
        obligation: { kind: 'store-capability', detail: `${req.id}: ${reason}` },
      })
    }
  }

  if (violations.length > 0) {
    return Result.fail(new StoreCapabilityError({ store: store.name, violations }))
  }
  return Result.succeed(undefined)
}

/**
 * Setup-time mount guard: throws `StoreCapabilityError` loudly if `store`
 * cannot enforce any declared `CrossRowRequirement`.
 */
export const assertStoreCapabilities = (
  store: StoreCapabilities,
  requirements: ReadonlyArray<CrossRowRequirement>,
): void => {
  const res = checkStoreCapabilities(store, requirements)
  if (Result.isFailure(res)) {
    throw res.failure
  }
}

export type ConcurrencyPolicy = 'latest' | 'queue' | 'drop' | 'optimistic-rollback'

export interface AsyncActionSpec {
  readonly tag: string
  readonly concurrency: ConcurrencyPolicy
  readonly optimistic?: boolean
}

/**
 * Emit structured `Obligation(kind: 'walk')` records for optimistic and async
 * actions whose correctness depends on network interleaving rather than
 * single-step static proofs.
 */
export const emitWalkObligations = (
  specs: ReadonlyArray<AsyncActionSpec>,
): ReadonlyArray<Verdict.Obligation> => {
  const out: Array<Verdict.Obligation> = []
  for (const spec of specs) {
    if (spec.concurrency === 'latest') {
      out.push({
        kind: 'walk',
        detail: `${spec.tag} (concurrency: latest): out-of-order stale response must not overwrite a newer in-flight or committed write`,
      })
    } else if (spec.concurrency === 'optimistic-rollback') {
      out.push({
        kind: 'walk',
        detail: `${spec.tag} (concurrency: optimistic-rollback): rejected optimistic write must restore last committed state without losing newer accepted writes`,
      })
    } else if (spec.concurrency === 'queue') {
      out.push({
        kind: 'walk',
        detail: `${spec.tag} (concurrency: queue): queued writes must settle in FIFO order regardless of network jitter`,
      })
    } else {
      out.push({
        kind: 'walk',
        detail: `${spec.tag} (concurrency: drop): duplicate triggers while in flight must be ignored until settled`,
      })
    }
    if (spec.optimistic === true && spec.concurrency !== 'optimistic-rollback') {
      out.push({
        kind: 'walk',
        detail: `${spec.tag} (optimistic): optimistic preview must converge with server response and recover on rejection`,
      })
    }
  }
  return out
}

/** A single step in a deterministic interleaving trace. */
export type WalkEvent<Action, Response> =
  | { readonly kind: 'send'; readonly seq: number; readonly action: Action }
  | { readonly kind: 'respond'; readonly seq: number; readonly response: Response }
  | { readonly kind: 'reject'; readonly seq: number; readonly reason: string }

export interface WalkFailure<State, Action, Response> {
  readonly scenario: string
  readonly stepIndex: number
  readonly reason: string
  readonly trace: ReadonlyArray<WalkEvent<Action, Response>>
  readonly state: State
}

export interface WalkReport<State, Action, Response> {
  readonly ok: boolean
  readonly seed: number
  readonly scenariosRun: number
  readonly discharged: ReadonlyArray<Verdict.Obligation>
  readonly failure: Option.Option<WalkFailure<State, Action, Response>>
}

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic seeded interleaving runner discharging `Obligation(kind: 'walk')`.
 *
 * Always executes explicit adversarial schedules first:
 *   1. Out-of-order response (`send(0), send(1), respond(1), respond(0)`) —
 *      directly tests stale-response suppression (`#480`).
 *   2. First-rejected, second-accepted (`send(0), send(1), reject(0), respond(1)`).
 *   3. First-accepted, second-rejected (`send(0), send(1), respond(0), reject(1)`).
 *   4. All-rejected rollback (`send(0), send(1), reject(1), reject(0)`).
 * Plus `randomRuns` (default `20`) seeded random send/respond/reject interleavings.
 */
export const runWalk = <State, Action, Response>(config: {
  readonly seed?: number
  readonly randomRuns?: number
  readonly obligations?: ReadonlyArray<Verdict.Obligation>
  readonly initial: () => State
  readonly actions: ReadonlyArray<Action>
  readonly send: (state: State, seq: number, action: Action) => State
  readonly serverResult: (seq: number, action: Action) => Response
  readonly onResponse: (state: State, seq: number, response: Response) => State
  readonly onReject: (state: State, seq: number, reason: string) => State
  /** Checked after EVERY event in every schedule. Return `Option.some(reason)` to fail. */
  readonly invariant: (
    state: State,
    history: ReadonlyArray<WalkEvent<Action, Response>>,
  ) => Option.Option<string>
  /** Checked after all in-flight actions have settled. Return `Option.some(reason)` to fail. */
  readonly finalCheck?: (
    state: State,
    history: ReadonlyArray<WalkEvent<Action, Response>>,
  ) => Option.Option<string>
}): WalkReport<State, Action, Response> => {
  const seed = config.seed ?? 0x5eed1234
  const randomRuns = config.randomRuns ?? 20
  const obligations = config.obligations ?? []

  if (config.actions.length === 0) {
    return {
      ok: true,
      seed,
      scenariosRun: 0,
      discharged: obligations,
      failure: Option.none(),
    }
  }

  const runSchedule = (
    scenario: string,
    events: ReadonlyArray<WalkEvent<Action, Response>>,
  ): Option.Option<WalkFailure<State, Action, Response>> => {
    let state = config.initial()
    const history: Array<WalkEvent<Action, Response>> = []
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!
      if (ev.kind === 'send') {
        state = config.send(state, ev.seq, ev.action)
      } else if (ev.kind === 'respond') {
        state = config.onResponse(state, ev.seq, ev.response)
      } else {
        state = config.onReject(state, ev.seq, ev.reason)
      }
      history.push(ev)
      const invFail = config.invariant(state, history)
      if (Option.isSome(invFail)) {
        return Option.some({
          scenario,
          stepIndex: i,
          reason: invFail.value,
          trace: history,
          state,
        })
      }
    }
    if (config.finalCheck !== undefined) {
      const finFail = config.finalCheck(state, history)
      if (Option.isSome(finFail)) {
        return Option.some({
          scenario,
          stepIndex: events.length - 1,
          reason: finFail.value,
          trace: history,
          state,
        })
      }
    }
    return Option.none()
  }

  const schedules: Array<{
    readonly name: string
    readonly events: ReadonlyArray<WalkEvent<Action, Response>>
  }> = []

  const a0 = config.actions[0]!
  const a1 = config.actions[1] ?? a0
  const r0 = config.serverResult(0, a0)
  const r1 = config.serverResult(1, a1)

  // Explicit adversarial schedules
  schedules.push(
    {
      name: 'out-of-order-stale-response',
      events: [
        { kind: 'send', seq: 0, action: a0 },
        { kind: 'send', seq: 1, action: a1 },
        { kind: 'respond', seq: 1, response: r1 },
        { kind: 'respond', seq: 0, response: r0 },
      ],
    },
    {
      name: 'first-rejected-second-accepted',
      events: [
        { kind: 'send', seq: 0, action: a0 },
        { kind: 'send', seq: 1, action: a1 },
        { kind: 'reject', seq: 0, reason: '503' },
        { kind: 'respond', seq: 1, response: r1 },
      ],
    },
    {
      name: 'first-accepted-second-rejected',
      events: [
        { kind: 'send', seq: 0, action: a0 },
        { kind: 'send', seq: 1, action: a1 },
        { kind: 'respond', seq: 0, response: r0 },
        { kind: 'reject', seq: 1, reason: '409' },
      ],
    },
    {
      name: 'all-rejected-out-of-order',
      events: [
        { kind: 'send', seq: 0, action: a0 },
        { kind: 'send', seq: 1, action: a1 },
        { kind: 'reject', seq: 1, reason: '503' },
        { kind: 'reject', seq: 0, reason: '503' },
      ],
    },
  )

  // Seeded random interleavings
  const rng = mulberry32(seed)
  for (let run = 0; run < randomRuns; run++) {
    const events: Array<WalkEvent<Action, Response>> = []
    let nextSeq = 0
    const inFlight: Array<{ readonly seq: number; readonly action: Action }> = []
    while (nextSeq < config.actions.length || inFlight.length > 0) {
      const canSend = nextSeq < config.actions.length
      const canSettle = inFlight.length > 0
      if (canSend && (!canSettle || rng() < 0.55)) {
        const action = config.actions[nextSeq]!
        events.push({ kind: 'send', seq: nextSeq, action })
        inFlight.push({ seq: nextSeq, action })
        nextSeq++
      } else {
        const idx = Math.floor(rng() * inFlight.length)
        const item = inFlight.splice(idx, 1)[0]!
        if (rng() < 0.25) {
          events.push({ kind: 'reject', seq: item.seq, reason: 'network-error' })
        } else {
          events.push({
            kind: 'respond',
            seq: item.seq,
            response: config.serverResult(item.seq, item.action),
          })
        }
      }
    }
    schedules.push({ name: `seeded-run-${run}`, events })
  }

  for (let s = 0; s < schedules.length; s++) {
    const sched = schedules[s]!
    const fail = runSchedule(sched.name, sched.events)
    if (Option.isSome(fail)) {
      return {
        ok: false,
        seed,
        scenariosRun: s + 1,
        discharged: [],
        failure: fail,
      }
    }
  }

  return {
    ok: true,
    seed,
    scenariosRun: schedules.length,
    discharged: obligations,
    failure: Option.none(),
  }
}
