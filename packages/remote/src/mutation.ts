/**
 * Mutation status and idempotent reconciliation.
 *
 * A mutation result is reconciled into the store **at most once per
 * `requestId`**, so a transport retry cannot apply the same change twice. An
 * unknown or already-applied result is a no-op.
 */
import { Data, Effect, Match, Option, Record as Rec, Schema } from 'effect'
import {
  Entity as DomainEntity,
  Write as DomainWrite,
  type AnyWrite,
  type BoundWrite,
  type Computation,
  type ContextRead,
  Derivation,
  Held,
  type AnyEntity,
  type EntityDerived,
  type Forbids,
  type HeldRow,
  type WriteSurface,
  type ExprContext,
  type Invariant,
  type MemoryOperators,
  type Predict,
} from 'foldkit-entity'
import { holderOf } from './held.js'
import type { OptimisticOperation } from './optimistic.js'
import { own, put } from './record.js'
import { refParts } from './relation.js'
import type { RelationRequirement } from './requirement.js'
import type { RemoteError } from './remoteData.js'
import { emptyStore, entityKey, tombstone, writeEntities, type EntityStore } from './store.js'

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

/**
 * A bound write as the store patches it: its fields as they are, and each
 * relation it points as the ref key the store holds (`'User:u1'`), or null.
 */
export const patchOfWrite = (bound: BoundWrite): NormalizedPatch => ({
  entity: bound.entity,
  id: bound.id,
  values: {
    ...bound.values,
    ...Rec.map(bound.links, link =>
      Option.match(link, { onNone: () => null, onSome: ref => entityKey(ref.entity, ref.id) }),
    ),
  },
})

/**
 * One member of a row as `store` holds it, for a path from the viewer: a row
 * known gone reaches no row (null), and a row or a field never read is unheld.
 */
const heldIn =
  (store: EntityStore): ContextRead<never, never> =>
  (row, key) => {
    const entry = store[entityKey(row.entity, row.id)]
    if (entry === undefined)
      return Effect.succeed(Held.unheld(`${row.entity} ${row.id} is not held`))
    if (entry.tombstone) return Effect.succeed(Held.of(null))
    return Effect.succeed(
      entry.present.has(key)
        ? Held.of(entry.values[key])
        : Held.unheld(`${row.entity}.${key} of ${row.id} is not held`),
    )
  }

/**
 * A write bound to its input, with what its Entity sets from the context
 * (`Entity.sets`) as `context` gives it: who asks (`Remote.make`'s viewer),
 * what their row holds (read from `store`), and when the reader acted
 * (`Data.mutate`'s `now`). A member with no value to give is left out of the
 * prediction, and the answer brings it.
 */
const contextBound = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  context: ExprContext,
  store: EntityStore,
): BoundWrite => {
  const bound = DomainWrite.bind(write, input as never, keys)
  const set = Effect.runSync(DomainWrite.contextValues(write, context, heldIn(store)))
  return {
    ...bound,
    values: { ...bound.values, ...set.values },
    links: { ...bound.links, ...set.links },
  }
}

const nobody: ExprContext = { viewer: Option.none(), now: Option.none() }

/**
 * What a declared write shows before the server answers: an update's or an
 * insert's row as a patch (an update's only for the keys named, when some
 * are), and an update's increments and computed fields, worked out over the
 * row the store holds when it is read. A delete shows its row deleted. What
 * the context sets is filled from `context` and `store`, where it can be.
 */
export const optimisticOfWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  context: ExprContext = nobody,
  store: EntityStore = emptyStore,
): ReadonlyArray<PendingPatch | PendingDelete> =>
  Match.value(write).pipe(
    Match.tagsExhaustive({
      Update: () => {
        const bound = contextBound(write, input, keys, context, store)
        const patch = patchOfWrite(bound)
        return [
          {
            ...patch,
            ...(Object.keys(bound.increments).length === 0 ? {} : { adds: bound.increments }),
            ...(Object.keys(bound.assignments).length === 0 ? {} : { computes: bound.assignments }),
          },
        ]
      },
      // A new row is read like any other, so it carries its own id.
      Insert: () => {
        const patch = patchOfWrite(contextBound(write, input, undefined, context, store))
        return [{ ...patch, values: { id: patch.id, ...patch.values } }]
      },
      Delete: (): ReadonlyArray<PendingDelete> => {
        const { entity, id } = DomainWrite.bind(write, input as never)
        return [{ _tag: 'Delete', entity, id }]
      },
    }),
  )

/**
 * A member a registered Entity derives over a relation of another, under the
 * pointing Entity: `Post.likeCount` (`Derived.count(Like.relations.post)`) is
 * `Count { relation: 'post', owner: 'Post', field: 'likeCount' }`, and
 * `Post.liked` (`Derived.exists(Like.relations.post, { viewer: Like.relations.user })`)
 * is `Exists { relation: 'post', viewer: 'user', owner: 'Post', field: 'liked' }`.
 */
export type DerivedBy = Data.TaggedEnum<{
  Count: { readonly relation: string; readonly owner: string; readonly field: string }
  Exists: {
    readonly relation: string
    readonly viewer: string
    readonly owner: string
    readonly field: string
  }
}>
export const DerivedBy = Data.taggedEnum<DerivedBy>()
type ExistsBy = Extract<DerivedBy, { readonly _tag: 'Exists' }>

/**
 * The derived members a declared write moves, as pending patches of the rows
 * its row points at. A count: an insert adds one where it points, a delete
 * takes one away where the row pointed, and a relink does both. An exists:
 * a row now pointing here and at `viewer` is found (its id), and a row the
 * store shows as found by this one is no longer, once the write deletes it or
 * points it elsewhere.
 *
 * Where the row pointed before is read from `store`: the row as held, or,
 * when the store holds an exists found by this row, the row it is found on
 * and the viewer. When neither says, nothing is predicted and the answer
 * decides. A member is moved only on a row that `store` holds it on.
 */
export const derivedOfWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  derived: ReadonlyArray<DerivedBy>,
  store: EntityStore,
  context: ExprContext,
): ReadonlyArray<PendingPatch> => {
  if (derived.length === 0) return []
  // A link the context sets (whoever asks) moves what it points at as an input's would.
  const bound = contextBound(
    write,
    input,
    write._tag === 'Update' ? keys : undefined,
    context,
    store,
  )
  const row = store[entityKey(bound.entity, bound.id)]
  const held = row === undefined || row.tombstone ? undefined : row
  const viewerKey = Option.map(context.viewer, ref => entityKey(ref.entity, ref.id))
  /** What a live row holds in `field`, as the store has it; none for a row gone or not held. */
  const holding = (key: string, field: string): Option.Option<unknown> =>
    Option.flatMap(Option.fromUndefinedOr(store[key]), entry =>
      entry.tombstone ? Option.none() : Option.some(entry.values[field]),
    )
  // The rows each exists shows as found by this row: a new row is found on none yet.
  const found = new Map<ExistsBy, ReadonlyArray<string>>()
  if (write._tag !== 'Insert')
    for (const member of derived.filter(DerivedBy.$is('Exists')))
      found.set(
        member,
        Object.keys(store).filter(
          key =>
            key.startsWith(`${member.owner}:`) &&
            Option.contains(holding(key, member.field), bound.id),
        ),
      )
  // Where the row points through `relation`: a ref key, null for nowhere, none when unknown.
  const before = (relation: string): Option.Option<unknown> => {
    if (held !== undefined && held.present.has(relation)) return Option.some(held.values[relation])
    for (const [member, rows] of found) {
      if (rows.length === 0) continue
      if (member.relation === relation) return Option.some(rows[0])
      if (member.viewer === relation && Option.isSome(viewerKey)) return viewerKey
    }
    // A row not there points nowhere, unless an update or a delete expected one.
    return write._tag === 'Insert' ? Option.some(null) : Option.none()
  }
  const patched = patchOfWrite(bound).values
  const after = (relation: string): Option.Option<unknown> =>
    Match.value(write).pipe(
      Match.tagsExhaustive({
        Delete: () => Option.some<unknown>(null),
        Insert: () => Option.some(Object.hasOwn(bound.links, relation) ? patched[relation] : null),
        Update: () =>
          Object.hasOwn(bound.links, relation) ? Option.some(patched[relation]) : before(relation),
      }),
    )
  const moves = new Map<
    string,
    { owner: string; values: Record<string, unknown>; adds: Record<string, number> }
  >()
  const at = (ref: string, owner: string) => {
    const move = moves.get(ref) ?? { owner, values: {}, adds: {} }
    moves.set(ref, move)
    return move
  }
  const count = (ref: unknown, owner: string, field: string, by: number): void => {
    if (typeof ref !== 'string') return
    if (!Option.exists(holding(ref, field), value => typeof value === 'number')) return
    const move = at(ref, owner)
    put(move.adds, field, (own(move.adds, field) ?? 0) + by)
  }
  for (const member of derived)
    DerivedBy.$match(member, {
      Count: ({ relation, owner, field }) => {
        const from = before(relation)
        const to = after(relation)
        if (Option.isNone(from) || Option.isNone(to) || from.value === to.value) return
        count(from.value, owner, field, -1)
        count(to.value, owner, field, 1)
      },
      Exists: exists => {
        const { relation, viewer: by, owner, field } = exists
        const pointed = after(relation)
        // Whether the row points at the viewer after the write: none when either is unknown.
        const viewing = Option.flatMap(after(by), ref => Option.map(viewerKey, key => ref === key))
        for (const ref of found.get(exists) ?? []) {
          // A delete points it nowhere, so it leaves every row it was found on.
          if (Option.exists(pointed, to => to !== ref) || Option.contains(viewing, false))
            put(at(ref, owner).values, field, null)
        }
        if (!Option.contains(viewing, true) || Option.isNone(pointed)) return
        const to = pointed.value
        if (typeof to === 'string' && Option.contains(holding(to, field), null))
          put(at(to, owner).values, field, bound.id)
      },
    })
  return [...moves].flatMap(([ref, { owner, values, adds }]) => {
    const moved = Object.fromEntries(Object.entries(adds).filter(([, by]) => by !== 0))
    return Object.keys(values).length === 0 && Object.keys(moved).length === 0
      ? []
      : [
          {
            entity: owner,
            id: refParts(ref).id,
            values,
            ...(Object.keys(moved).length === 0 ? {} : { adds: moved }),
          },
        ]
  })
}

/**
 * A new row's derived members over relations: each count 0 and each exists
 * none, since no row points at a row not yet made. A later pending write that
 * points at it moves them as it would any held row's.
 */
const freshDerived = (
  write: AnyWrite,
  input: unknown,
  derived: ReadonlyMap<string, ReadonlyArray<DerivedBy>>,
): ReadonlyArray<PendingPatch> => {
  const entity = write.input.entity.name
  const values: Record<string, unknown> = {}
  for (const members of derived.values())
    for (const member of members)
      if (member.owner === entity)
        put(values, member.field, DerivedBy.$match(member, { Count: () => 0, Exists: () => null }))
  if (Object.keys(values).length === 0) return []
  const { id } = DomainWrite.bind(write, input as never)
  return [{ entity, id, values }]
}

/** Each supplied member of `entity` that says how a client foresees it, by key. */
const predicted = new WeakMap<AnyEntity, ReadonlyArray<readonly [string, Predict]>>()
const predictorsOf = (entity: AnyEntity): ReadonlyArray<readonly [string, Predict]> => {
  const known = predicted.get(entity)
  if (known !== undefined) return known
  const derived: Readonly<Record<string, EntityDerived<string, string, Schema.Constraint>>> =
    entity.derived
  const found = Object.entries(derived).flatMap(([key, member]) =>
    Derivation.$match(member.derives, {
      Supplied: ({ predict }) =>
        Option.match(predict, { onNone: () => [], onSome: run => [[key, run] as const] }),
      Count: () => [],
      Exists: () => [],
    }),
  )
  predicted.set(entity, found)
  return found
}

/**
 * The supplied members a write's row foresees (`Derived.make`'s `predict`),
 * judged over the row it leaves, held over the store with the write's values:
 * a member foreseen as none is left out, so the row waits for the answer.
 */
const suppliedOfWrite = (
  write: AnyWrite,
  own: PendingPatch,
  by: ExprContext,
  store: EntityStore,
): ReadonlyArray<PendingPatch> => {
  const entity = write.input.entity
  const predictors = predictorsOf(entity)
  if (predictors.length === 0) return []
  const holder = holderOf(store)
  const row = holder.written(entity, own.id, own.values, [
    ...Object.keys(own.adds ?? {}),
    ...Object.keys(own.computes ?? {}),
  ])
  const values: Record<string, unknown> = {}
  for (const [key, predict] of predictors) {
    Option.map(predict({ entity, row, rows: holder.rows, context: by }), value => {
      put(values, key, value)
    })
  }
  return Object.keys(values).length === 0 ? [] : [{ entity: entity.name, id: own.id, values }]
}

/**
 * The supplied members a write's row foresees (`Derived.make`'s `predict`,
 * Guard's `may`), for its answer to carry whatever this write foresaw: one
 * foreseen as none leaves the row waiting for the answer, and a page opened
 * on the row meanwhile reads it, though no Surface did when it was sent
 * (#370). A delete leaves no row.
 */
export const foreseenOfWrite = (write: AnyWrite): ReadonlyArray<RelationRequirement> => {
  const foreseen = (): ReadonlyArray<RelationRequirement> => {
    const keys = predictorsOf(write.input.entity).map(([key]) => key)
    return keys.length === 0 ? [] : [{ entity: write.input.entity.name, fields: keys }]
  }
  return Match.value(write).pipe(
    Match.tagsExhaustive({ Insert: foreseen, Update: foreseen, Delete: () => [] }),
  )
}

/**
 * Everything a declared write shows before the server answers, from its
 * declarations alone: its own row (`optimisticOfWrite`), with what the
 * context sets filled from `viewer` and `now`, a new row's
 * derived members (`freshDerived`), what its supplied members foresee
 * (`suppliedOfWrite`, Guard's `may`), and the derived members it moves on
 * the rows it points at (`derivedOfWrite`). `derived` is the registry's, by
 * the pointing Entity; `store` is the store as shown, layers and all.
 */
export const predictionOfWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  context: {
    readonly derived: ReadonlyMap<string, ReadonlyArray<DerivedBy>>
    readonly store: EntityStore
    readonly viewer: Option.Option<{ readonly entity: string; readonly id: string }>
    readonly now: Option.Option<number>
  },
): ReadonlyArray<PendingPatch | PendingDelete> => {
  const by: ExprContext = { viewer: context.viewer, now: context.now }
  const own = optimisticOfWrite(write, input, keys, by, context.store)
  return [
    ...Match.value(write).pipe(
      Match.tagsExhaustive({
        Insert: () => freshDerived(write, input, context.derived),
        Update: () => [],
        Delete: () => [],
      }),
    ),
    ...own,
    ...own.flatMap(patch =>
      '_tag' in patch ? [] : suppliedOfWrite(write, patch, by, context.store),
    ),
    ...derivedOfWrite(
      write,
      input,
      keys,
      context.derived.get(write.input.entity.name) ?? [],
      context.store,
      by,
    ),
  ]
}

/** The held fields of `row`, plain and encoded, as an invariant is judged over them. */
const plainRow = (entity: AnyEntity, row: HeldRow): Record<string, unknown> => {
  const plain: Record<string, unknown> = {}
  for (const key of Object.keys(entity.fields))
    Held.match(row.field(key), {
      onHeld: value => {
        put(plain, key, value)
      },
      onUnheld: () => undefined,
    })
  return plain
}

/**
 * The invariant a declared write's row would break, as the client holds it:
 * the store's row with the write's values over it, a field the write moves
 * (an increment, a computed value) not held, and for an update the row
 * before. Only a definite failure counts: an invariant over a field the
 * client lacks is undecided, and refuses nothing. A delete leaves no row.
 */
export const brokenByWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  context: ExprContext,
  store: EntityStore,
  operators: MemoryOperators,
): Option.Option<Invariant> => {
  const entity = write.input.entity
  const patch = optimisticOfWrite(write, input, keys, context, store).find(
    (each): each is PendingPatch => !('_tag' in each),
  )
  if (patch === undefined) return Option.none()
  const holder = holderOf(store)
  const after = plainRow(
    entity,
    holder.written(entity, patch.id, patch.values, [
      ...Object.keys(patch.adds ?? {}),
      ...Object.keys(patch.computes ?? {}),
    ]),
  )
  const before = Option.getOrUndefined(
    Option.map(holder.rows.row(entity, patch.id), row => plainRow(entity, row)),
  )
  const judged = DomainEntity.judge(
    entity,
    write._tag === 'Insert' || before === undefined ? { after } : { after, before },
    operators,
  )
  return judged._tag === 'Invalid' ? Option.fromUndefinedOr(judged.failures[0]) : Option.none()
}

/** Each supplied member of `entity` that says which write its value refuses, by key. */
const forbidding = new WeakMap<AnyEntity, ReadonlyArray<readonly [string, Forbids]>>()
const forbiddersOf = (entity: AnyEntity): ReadonlyArray<readonly [string, Forbids]> => {
  const known = forbidding.get(entity)
  if (known !== undefined) return known
  const derived: Readonly<Record<string, EntityDerived<string, string, Schema.Constraint>>> =
    entity.derived
  const found = Object.entries(derived).flatMap(([key, member]) =>
    Derivation.$match(member.derives, {
      Supplied: ({ forbids }) =>
        Option.match(forbids, { onNone: () => [], onSome: run => [[key, run] as const] }),
      Count: () => [],
      Exists: () => [],
    }),
  )
  forbidding.set(entity, found)
  return found
}

/**
 * Why a declared write is refused by what the client holds of its row: a
 * supplied member (Guard's `may`) whose value, as the store shows it, forbids
 * what the write does to the row. None where nothing held says so: an
 * insert, a row not held, or a member not held or not refusing.
 */
export const forbiddenByWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
  store: EntityStore,
): Option.Option<{ readonly reason: Option.Option<string> }> => {
  const entity = write.input.entity
  const forbidders = forbiddersOf(entity)
  if (forbidders.length === 0) return Option.none()
  const bound = DomainWrite.bind(write, input as never, keys)
  const held = store[entityKey(entity.name, bound.id)]
  if (held === undefined) return Option.none()
  // An insert finds no row, so nothing held of one can refuse it.
  const surface = Match.valueTags(write, {
    Insert: (): Option.Option<WriteSurface> => Option.none(),
    Delete: () => Option.some<WriteSurface>({ kind: 'Delete', members: [], relations: [] }),
    Update: () =>
      Option.some<WriteSurface>({
        kind: 'Update',
        members: [
          ...Object.keys(bound.values),
          ...Object.keys(bound.increments),
          ...Object.keys(bound.assignments),
        ],
        relations: Object.entries(bound.links).map(([relation, link]) => ({
          relation,
          interaction: Option.isSome(link) ? 'Link' : 'Unlink',
        })),
      }),
  })
  return Option.flatMap(surface, asked =>
    Option.firstSomeOf(
      forbidders.map(([key, forbids]) =>
        held.present.has(key) ? forbids(held.values[key], asked) : Option.none(),
      ),
    ),
  )
}
