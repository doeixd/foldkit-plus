/**
 * Mutation status and idempotent reconciliation.
 *
 * A mutation result is reconciled into the store **at most once per
 * `requestId`**, so a transport retry cannot apply the same change twice. An
 * unknown or already-applied result is a no-op.
 */
import { Option, Record as Rec, Schema } from 'effect'
import type { AnyWrite, BoundWrite, Write } from 'foldkit-entity'
import type { RemoteError } from './remoteData.js'
import { entityKey, tombstone, writeEntities, type EntityStore } from './store.js'

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

/** What a settled mutation wrote, as `MutationSucceeded` carries it. */
export interface MutationAnswer {
  readonly entities: ReadonlyArray<NormalizedPatch>
  /** Entities the mutation deleted; each is tombstoned. */
  readonly deleted?: ReadonlyArray<{ readonly entity: string; readonly id: string }> | undefined
  /** Injected clock reading of the answer, which dates what it writes. */
  readonly now: number
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
  // Patches first, then deletions: a mutation that names an entity both ways has deleted it.
  const next = state.applied.has(requestId)
    ? store
    : (answer.deleted ?? []).reduce(
        (current, gone) => tombstone(current, entityKey(gone.entity, gone.id)),
        writeEntities(
          store,
          answer.entities.map(entity => ({
            key: entityKey(entity.entity, entity.id),
            values: entity.values,
          })),
          answer.now,
        ),
      )
  const applied = remember(state.applied, requestId)
  const pending = new Set(state.pending)
  pending.delete(requestId)
  return { store: next, state: { ...state, applied, pending } }
}

/** A mutation an application declares: its name and input/output codecs. */
export interface MutationDescriptor<Name extends string, Input, Output, Refused = unknown> {
  readonly name: Name
  readonly Input: Schema.Codec<Input>
  readonly Output: Schema.Codec<Output>
  /**
   * What the server may refuse the mutation with, as a value a client can
   * match on rather than a message to parse: `Schema.Never` when it declares
   * none.
   */
  readonly Refusal: Schema.Codec<Refused, unknown>
  /**
   * What the mutation writes, when it was declared as a `Write`: the optimistic
   * patch a client shows, and what a server can run without a handler.
   */
  readonly write?: AnyWrite | undefined
}

const conflict = Schema.TaggedStruct('Conflict', {})
const anyField = Schema.TaggedStruct('Field', { key: Schema.String, reason: Schema.Unknown })

/** Refusals a form or an editor knows how to show. */
export const Refusal = {
  /** One input key was refused, for `reason`, which a form shows beside that key. */
  field: <const Key extends string, Reason extends Schema.Top>(key: Key, reason: Reason) =>
    Schema.TaggedStruct('Field', { key: Schema.Literal(key), reason }),
  /** The row moved on since the client read it; the author decides what wins. */
  conflict,
  /** Whether a refusal, of whatever mutation, is a `Refusal.field`. */
  isField: Schema.is(anyField),
  /** Whether a refusal, of whatever mutation, is `Refusal.conflict`. */
  isConflict: Schema.is(conflict),
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

export const Mutation = {
  /**
   * Declares a mutation. `Input` and `Output` are codecs, or the fields of the
   * `Schema.Struct` they would be (`{ id: ProjectId, name: Schema.String }`).
   * `Refusal`, when given, is what the server may refuse with: a codec, usually
   * a union of `Refusal.field(...)` and `Refusal.conflict`.
   */
  /**
   * A mutation that is a declared `Write`: its input is the write's, and it
   * answers nothing but the row it changed, as a patch. It may be refused as a
   * conflict, for a write that `expect`s a revision the row has moved past.
   */
  update: <const Name extends string, Fields extends Schema.Struct.Fields>(
    name: Name,
    write: Write<any, Fields>,
  ): MutationDescriptor<Name, Schema.Struct.Type<Fields>, {}, typeof Refusal.conflict.Type> & {
    readonly write: Write<any, Fields>
  } => ({
    name,
    Input: write.input.schema as unknown as Schema.Codec<Schema.Struct.Type<Fields>>,
    Output: Schema.Struct({}),
    Refusal: Refusal.conflict,
    write,
  }),

  make: <
    const Name extends string,
    Input extends SchemaOrFields,
    Output extends SchemaOrFields,
    Refused = never,
  >(
    name: Name,
    config: {
      readonly Input: Input
      readonly Output: Output
      readonly Refusal?: Schema.Codec<Refused, any>
    },
  ): MutationDescriptor<Name, TypeOf<Input>, TypeOf<Output>, Refused> => ({
    name,
    Input: schemaOf(config.Input),
    Output: schemaOf(config.Output),
    Refusal: config.Refusal ?? Schema.Never,
  }),
}
