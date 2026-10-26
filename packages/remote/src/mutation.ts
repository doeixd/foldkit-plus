/**
 * Mutation status and idempotent reconciliation.
 *
 * A mutation result is reconciled into the store **at most once per
 * `requestId`**, so a transport retry cannot apply the same change twice. An
 * unknown or already-applied result is a no-op.
 */
import { Match, Option, Record as Rec, Schema } from 'effect'
import {
  Write as DomainWrite,
  type AnyWrite,
  type BoundWrite,
  type Computation,
  type ConditionedWrite,
  type Invariant,
  type Write,
} from 'foldkit-entity'
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
  operations: new Map(),
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
  operation: string,
): MutationState => {
  const pending = new Set(state.pending)
  pending.delete(requestId)
  const failed = remember(state.failed, requestId)
  const errors = new Map([...state.errors, [requestId, error] as const])
  const operations = new Map([...state.operations, [requestId, operation] as const])
  // `failed` is a bounded window; an error or an operation outlives its id by nothing.
  for (const id of errors.keys()) if (!failed.has(id)) errors.delete(id)
  for (const id of operations.keys()) if (!failed.has(id)) operations.delete(id)
  return { ...state, pending, failed, errors, operations }
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
const unmet = Schema.TaggedStruct('Unmet', {})
/**
 * The row the write would leave breaks one of its Entity's invariants: which
 * one, what to tell the author, and the fields to show it beside. None and
 * empty when the invariant reads a member hidden from whoever asked.
 */
const invalid = Schema.TaggedStruct('Invalid', {
  rule: Schema.OptionFromNullOr(Schema.String),
  message: Schema.String,
  path: Schema.Array(Schema.String),
})
const conflictOrInvalid = Schema.Union([conflict, invalid])
const conflictUnmetOrInvalid = Schema.Union([conflict, unmet, invalid])
const anyField = Schema.TaggedStruct('Field', { key: Schema.String, reason: Schema.Unknown })

/** Refusals a form or an editor knows how to show. */
export const Refusal = {
  /** One input key was refused, for `reason`, which a form shows beside that key. */
  field: <const Key extends string, Reason extends Schema.Top>(key: Key, reason: Reason) =>
    Schema.TaggedStruct('Field', { key: Schema.Literal(key), reason }),
  /** The row moved on since the client read it; the author decides what wins. */
  conflict,
  /** The row does not hold what the write's `when` asks of it, where it would commit. */
  unmet,
  /** The row the write would leave breaks an invariant of its Entity. */
  invalid,
  /** Whether a refusal, of whatever mutation, is a `Refusal.field`. */
  isField: Schema.is(anyField),
  /** Whether a refusal, of whatever mutation, is `Refusal.conflict`. */
  isConflict: Schema.is(conflict),
  /** Whether a refusal, of whatever mutation, is `Refusal.unmet`. */
  isUnmet: Schema.is(unmet),
  /** Whether a refusal, of whatever mutation, is `Refusal.invalid`. */
  isInvalid: Schema.is(invalid),
  /**
   * Whether a refusal is `Refusal.invalid` naming this invariant: the one
   * `Entity.invariant` returned, or one `Entity.invariants` reads. An invariant
   * over a member hidden from the asker names none, so it matches nothing.
   */
  isInvalidBy: (refusal: unknown, invariant: Pick<Invariant, 'id'>): boolean =>
    Schema.is(invalid)(refusal) && Option.contains(refusal.rule, invariant.id),
}

/**
 * What a declared write may be refused with: unmet too, when it has a `when`,
 * and invalid always, since the server's Entity may hold invariants the
 * client's does not show.
 */
export type RefusalOfWrite<W> =
  | (W extends ConditionedWrite<any, any>
      ? typeof conflict.Type | typeof unmet.Type
      : typeof conflict.Type)
  | typeof invalid.Type

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

/**
 * What a declared write shows before the server answers: an update's or an
 * insert's row as a patch (an update's only for the keys named, when some
 * are), and an update's increments and computed fields, worked out over the
 * row the store holds when it is read. A delete shows nothing, since no
 * operation removes a row from every list it is in; its answer does.
 */
export const optimisticOfWrite = (
  write: AnyWrite,
  input: unknown,
  keys: ReadonlyArray<string> | undefined,
): ReadonlyArray<PendingPatch> =>
  Match.value(write).pipe(
    Match.tagsExhaustive({
      Update: () => {
        const bound = DomainWrite.bind(write, input as never, keys)
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
        const patch = patchOfWrite(DomainWrite.bind(write, input as never))
        return [{ ...patch, values: { id: patch.id, ...patch.values } }]
      },
      Delete: () => [],
    }),
  )

export const Mutation = {
  /**
   * Declares a mutation. `Input` and `Output` are codecs, or the fields of the
   * `Schema.Struct` they would be (`{ id: ProjectId, name: Schema.String }`).
   * `Refusal`, when given, is what the server may refuse with: a codec, usually
   * a union of `Refusal.field(...)` and `Refusal.conflict`.
   */
  /**
   * A mutation that is a declared `Write` (`update`, `insert` or `delete`): its
   * input is the write's, and it answers nothing but the row it changed, as a
   * patch, or its deletion. It may be refused as a conflict, for a write that
   * `expect`s a revision the row has moved past, for a write with a `when` as
   * unmet, and as invalid when the row it would leave breaks an invariant.
   */
  write: <
    const Name extends string,
    Fields extends Schema.Struct.Fields,
    W extends Write<any, Fields> = Write<any, Fields>,
  >(
    name: Name,
    write: W & Write<any, Fields>,
  ): MutationDescriptor<Name, Schema.Struct.Type<Fields>, {}, RefusalOfWrite<W>> & {
    readonly write: W
  } => ({
    name,
    Input: write.input.schema as unknown as Schema.Codec<Schema.Struct.Type<Fields>>,
    Output: Schema.Struct({}),
    // What the overloads typed `W` by is whether it holds a `when`.
    Refusal: (Option.isSome(write.when)
      ? conflictUnmetOrInvalid
      : conflictOrInvalid) as unknown as Schema.Codec<RefusalOfWrite<W>, unknown>,
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
