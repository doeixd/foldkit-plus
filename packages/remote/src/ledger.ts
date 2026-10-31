/**
 * Mutation status and idempotent reconciliation.
 *
 * A mutation result is reconciled into the store **at most once per
 * `requestId`**, so a transport retry cannot apply the same change twice. An
 * unknown or already-applied result is a no-op.
 */
import { Option } from 'effect'
import type { Computation } from 'foldkit-entity'
import type { OptimisticOperation } from './optimistic.js'
import type { RemoteError } from './remoteData.js'
import { entityKey, tombstone, writeEntities, type EntityStore } from './store.js'

export interface NormalizedPatch {
  readonly entity: string
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
}

/**
 * A patch a pending request shows, the amounts it moves fields by, and the
 * fields it computes: each worked out, whenever the store is read, over the
 * row as it then is, so a change that reaches the store meanwhile is added
 * to or computed from, not hidden. A computation is data (operators by name),
 * never a descriptor, since a pending patch sits in the Model.
 */
export interface PendingPatch extends NormalizedPatch {
  readonly adds?: Readonly<Record<string, number>>
  readonly computes?: Readonly<Record<string, Computation>>
}

/**
 * A row a pending request deletes: until the request settles it reads
 * `NotFound` and leaves every list and relation, as a settled delete does.
 */
export interface PendingDelete {
  readonly _tag: 'Delete'
  readonly entity: string
  readonly id: string
}

/**
 * What a request writes, as `Data.mutate` started it: enough to list it once it
 * fails, with its input, and to send it again as itself.
 */
export interface StartedWrite {
  /** The registered mutation's name. */
  readonly mutation: string
  /** The input as `Data.mutate` was given it, decoded. */
  readonly input: unknown
  readonly keys?: ReadonlyArray<string> | undefined
  /**
   * When the reader acted, as `Data.mutate` was given it: what it predicted
   * `Expr.now` as and sent, and what a retry sends again. None when it was
   * given none, and the server's clock decides.
   */
  readonly now: Option.Option<number>
  /** What it showed until it settled, shown again by a retry. */
  readonly optimistic: ReadonlyArray<OptimisticOperation>
}

export interface MutationState {
  readonly pending: ReadonlySet<string>
  readonly applied: ReadonlySet<string>
  readonly failed: ReadonlySet<string>
  /** Why each request in `failed` failed, kept exactly as long as `failed` keeps its id. */
  readonly errors: ReadonlyMap<string, RemoteError>
  /**
   * The operation id each request in `failed` was sent with, kept as `errors`
   * is: a retry of that request id sends it again, so a server recognises it.
   */
  readonly operations: ReadonlyMap<string, string>
  /**
   * What each pending or failed request writes. A request settled as applied,
   * or dismissed, takes its write with it.
   */
  readonly writes: ReadonlyMap<string, StartedWrite>
  /**
   * How many mutations this model has started. A bound domain takes its next
   * request id from here, so `update` stays pure and the id exists before the
   * Command runs.
   */
  readonly sequence: number
  /** Where each pending request falls in `sequence`: the order its answer is applied in. */
  readonly order: ReadonlyMap<string, number>
  /**
   * The order of the last answer that wrote each row field (`entity:id\0field`)
   * or deleted each row (`entity:id`), kept only while a request started
   * before it is pending, since only that request's answer is compared with it.
   */
  readonly settled: ReadonlyMap<string, number>
}

export const emptyMutationState: MutationState = {
  pending: new Set(),
  applied: new Set(),
  failed: new Set(),
  errors: new Map(),
  operations: new Map(),
  writes: new Map(),
  sequence: 0,
  order: new Map(),
  settled: new Map(),
}

/**
 * How many settled request ids a mutation state retains. A retry settles well
 * inside this window, so bounding the ledger stops a long-lived application
 * from growing it without limit; a retry older than the window would re-apply
 * its entities.
 */
const MUTATION_ID_WINDOW = 1024

/** Records `id` as most recent, evicting the oldest once the window is full. */
const remember = (ids: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(ids)
  // Re-inserting an existing id moves it to the most-recent end.
  next.delete(id)
  next.add(id)
  if (next.size <= MUTATION_ID_WINDOW) return next
  return new Set([...next].slice(next.size - MUTATION_ID_WINDOW))
}

export const beginMutation = (
  state: MutationState,
  requestId: string,
  write?: StartedWrite,
): MutationState => ({
  ...state,
  pending: new Set([...state.pending, requestId]),
  writes: write === undefined ? state.writes : new Map([...state.writes, [requestId, write]]),
  sequence: state.sequence + 1,
  order: new Map([...state.order, [requestId, state.sequence + 1]]),
})

export const failMutation = (
  state: MutationState,
  requestId: string,
  error: RemoteError,
  operation: string,
): MutationState => {
  // Only a request in flight can fail: a repeated failure, one after the
  // request applied or was dismissed, or one `forget` settled, changes nothing.
  if (!state.pending.has(requestId)) return state
  const pending = new Set(state.pending)
  pending.delete(requestId)
  const failed = remember(state.failed, requestId)
  const errors = new Map([...state.errors, [requestId, error] as const])
  const operations = new Map([...state.operations, [requestId, operation] as const])
  const writes = new Map(state.writes)
  // `failed` is a bounded window; an error, an operation or a write outlives its id by nothing.
  for (const id of errors.keys()) if (!failed.has(id)) errors.delete(id)
  for (const id of operations.keys()) if (!failed.has(id)) operations.delete(id)
  for (const id of writes.keys()) if (!failed.has(id) && !pending.has(id)) writes.delete(id)
  return { ...state, pending, failed, errors, operations, writes, ...ordered(state, requestId, []) }
}

/**
 * `order` without a request that settled, and `settled` with what its answer
 * wrote (`marks`), each kept only while a request started before it is pending.
 */
const ordered = (
  state: MutationState,
  requestId: string,
  marks: ReadonlyArray<string>,
): Pick<MutationState, 'order' | 'settled'> => {
  const at = state.order.get(requestId)
  const order = new Map(state.order)
  order.delete(requestId)
  const earliest = Math.min(...order.values())
  const settled = new Map<string, number>()
  for (const [mark, by] of state.settled) if (by > earliest) settled.set(mark, by)
  if (at !== undefined && at > earliest) for (const mark of marks) settled.set(mark, at)
  return { order, settled }
}

/** The ledger with a request's failure forgotten: its id, error, operation and write. */
export const forgetFailure = (state: MutationState, requestId: string): MutationState => {
  const without = <V>(map: ReadonlyMap<string, V>): ReadonlyMap<string, V> => {
    if (!map.has(requestId)) return map
    const next = new Map(map)
    next.delete(requestId)
    return next
  }
  return {
    ...state,
    failed: state.failed.has(requestId)
      ? new Set([...state.failed].filter(id => id !== requestId))
      : state.failed,
    errors: without(state.errors),
    operations: without(state.operations),
    writes: without(state.writes),
  }
}

/** What Remote knows of one mutation request, by the id `mutate` returned. */
export type MutationStatus =
  /** Never started here, or settled so long ago its id has left the window. */
  | { readonly _tag: 'Unknown' }
  | { readonly _tag: 'Pending' }
  | { readonly _tag: 'Applied' }
  | { readonly _tag: 'Failed'; readonly error: RemoteError }

export const mutationStatus = (state: MutationState, requestId: string): MutationStatus => {
  // A retry reuses its request id, so the latest outcome wins: in flight, then
  // applied (a request cannot fail once applied), then the failure it last had.
  if (state.pending.has(requestId)) return { _tag: 'Pending' }
  if (state.applied.has(requestId)) return { _tag: 'Applied' }
  const error = state.errors.get(requestId)
  return error === undefined ? { _tag: 'Unknown' } : { _tag: 'Failed', error }
}

export interface Reconciled {
  readonly store: EntityStore
  readonly state: MutationState
}

/** What a settled mutation wrote, as `MutationSucceeded` carries it. */
export interface MutationAnswer {
  readonly entities: ReadonlyArray<NormalizedPatch>
  /** Entities the mutation deleted; each is tombstoned. */
  readonly deleted?: ReadonlyArray<{ readonly entity: string; readonly id: string }> | undefined
  /** Injected clock reading of the answer, which dates what it writes. */
  readonly now: number
}

/**
 * What requests started after `requestId` already settled, which its answer
 * leaves alone. The server applied requests in the order they started, so a
 * later one's answer is newer: `newer` holds of a field it wrote (its mark)
 * and of a row it deleted (its key), `rewritten` of a row it wrote any field
 * of. An answer of a request no longer pending (after `forget`, or a failure)
 * has no order, and nothing is newer than it.
 */
export const settledLater = (
  state: MutationState,
  requestId: string,
): {
  readonly newer: (mark: string) => boolean
  readonly rewritten: (key: string) => boolean
} => {
  const at = state.order.get(requestId) ?? Infinity
  return {
    newer: mark => (state.settled.get(mark) ?? -Infinity) > at,
    rewritten: key =>
      [...state.settled].some(([mark, by]) => by > at && mark.startsWith(`${key}\u0000`)),
  }
}

/**
 * Applies a mutation result once and marks the request settled. A second call
 * with the same `requestId` (a retry, or a live event describing the same change)
 * does not re-apply the entities, but still clears `pending`.
 */
export const reconcileMutation = (
  store: EntityStore,
  state: MutationState,
  requestId: string,
  answer: MutationAnswer,
): Reconciled => {
  const repeated = state.applied.has(requestId)
  if (repeated && !state.pending.has(requestId) && !state.failed.has(requestId))
    return { store, state }
  const { newer, rewritten } = settledLater(state, requestId)
  const writes = repeated
    ? []
    : answer.entities.flatMap(entity => {
        const key = entityKey(entity.entity, entity.id)
        if (newer(key)) return []
        const values = Object.fromEntries(
          Object.entries(entity.values).filter(([field]) => !newer(`${key}\u0000${field}`)),
        )
        return Object.keys(values).length === 0 ? [] : [{ key, values }]
      })
  const deleted = repeated
    ? []
    : (answer.deleted ?? [])
        .map(gone => entityKey(gone.entity, gone.id))
        .filter(key => !rewritten(key))
  // Patches first, then deletions: a mutation that names an entity both ways has deleted it.
  const next = deleted.reduce(tombstone, writeEntities(store, writes, answer.now))
  const applied = remember(state.applied, requestId)
  const pending = new Set(state.pending)
  pending.delete(requestId)
  const marks = [
    ...writes.flatMap(write =>
      Object.keys(write.values).map(field => `${write.key}\u0000${field}`),
    ),
    ...deleted,
  ]
  // A retry that applies is no longer a failure to list.
  return {
    store: next,
    state: {
      ...forgetFailure(state, requestId),
      applied,
      pending,
      ...ordered(state, requestId, marks),
    },
  }
}
