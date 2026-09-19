/**
 * Mutation status and idempotent reconciliation.
 *
 * A mutation result is reconciled into the store **at most once per
 * `requestId`**, so a transport retry cannot apply the same change twice. An
 * unknown or already-applied result is a no-op.
 */
import { Schema } from 'effect'
import type { RemoteError } from './remoteData.js'
import { entityKey, tombstone, writeEntity, type EntityStore } from './store.js'

export interface NormalizedPatch {
  readonly entity: string
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
}

export interface MutationState {
  readonly pending: ReadonlySet<string>
  readonly applied: ReadonlySet<string>
  readonly failed: ReadonlySet<string>
  /** Why each request in `failed` failed, kept exactly as long as `failed` keeps its id. */
  readonly errors: ReadonlyMap<string, RemoteError>
  /**
   * How many mutations this model has started. A bound domain takes its next
   * request id from here, so `update` stays pure and the id exists before the
   * Command runs.
   */
  readonly sequence: number
}

export const emptyMutationState: MutationState = {
  pending: new Set(),
  applied: new Set(),
  failed: new Set(),
  errors: new Map(),
  sequence: 0,
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

export const beginMutation = (state: MutationState, requestId: string): MutationState => ({
  ...state,
  pending: new Set([...state.pending, requestId]),
  sequence: state.sequence + 1,
})

export const failMutation = (
  state: MutationState,
  requestId: string,
  error: RemoteError,
): MutationState => {
  const pending = new Set(state.pending)
  pending.delete(requestId)
  const failed = remember(state.failed, requestId)
  const errors = new Map([...state.errors, [requestId, error] as const])
  // `failed` is a bounded window; an error outlives its id by nothing.
  for (const id of errors.keys()) if (!failed.has(id)) errors.delete(id)
  return { ...state, pending, failed, errors }
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

/**
 * Applies a mutation result once and marks the request settled. A second call
 * with the same `requestId` (a retry, or a live event describing the same change)
 * does not re-apply the entities, but still clears `pending`.
 */
export const reconcileMutation = (
  store: EntityStore,
  state: MutationState,
  requestId: string,
  entities: ReadonlyArray<NormalizedPatch>,
  deleted: ReadonlyArray<{ readonly entity: string; readonly id: string }> = [],
): Reconciled => {
  // Patches first, then deletions: a mutation that names an entity both ways has deleted it.
  const next = state.applied.has(requestId)
    ? store
    : deleted.reduce(
        (current, gone) => tombstone(current, entityKey(gone.entity, gone.id)),
        entities.reduce(
          (current, entity) =>
            writeEntity(current, entityKey(entity.entity, entity.id), entity.values),
          store,
        ),
      )
  const applied = remember(state.applied, requestId)
  const pending = new Set(state.pending)
  pending.delete(requestId)
  return { store: next, state: { ...state, applied, pending } }
}

/** A mutation an application declares: its name and input/output codecs. */
export interface MutationDescriptor<Name extends string, Input, Output> {
  readonly name: Name
  readonly Input: Schema.Codec<Input>
  readonly Output: Schema.Codec<Output>
}

/** A codec, or the fields of a `Schema.Struct` where one is expected. */
export type SchemaOrFields = Schema.Codec<any, any, any, any> | Schema.Struct.Fields

/** The decoded type of a codec, or of the Struct the fields describe. */
export type TypeOf<S extends SchemaOrFields> =
  S extends Schema.Codec<infer T, any, any, any>
    ? T
    : S extends Schema.Struct.Fields
      ? Schema.Struct.Type<S>
      : never

/** The codec itself, or a `Schema.Struct` over the fields. */
export const schemaOf = <S extends SchemaOrFields>(shape: S): Schema.Codec<TypeOf<S>> =>
  (Schema.isSchema(shape) ? shape : Schema.Struct(shape as Schema.Struct.Fields)) as Schema.Codec<
    TypeOf<S>
  >

export const Mutation = {
  /**
   * Declares a mutation. `Input` and `Output` are codecs, or the fields of the
   * `Schema.Struct` they would be (`{ id: ProjectId, name: Schema.String }`).
   */
  make: <const Name extends string, Input extends SchemaOrFields, Output extends SchemaOrFields>(
    name: Name,
    config: { readonly Input: Input; readonly Output: Output },
  ): MutationDescriptor<Name, TypeOf<Input>, TypeOf<Output>> => ({
    name,
    Input: schemaOf(config.Input),
    Output: schemaOf(config.Output),
  }),
}
