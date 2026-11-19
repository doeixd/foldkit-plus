/**
 * Mutations as an application declares them, and what the server may refuse
 * one with. A descriptor carries the code a client runs to show the write
 * (#378), so a domain that registers none never loads it.
 */
import { Match, Option, Schema } from 'effect'
import {
  Entity,
  Write,
  type AnyEntity,
  type AnyWrite,
  type ConditionedWrite,
  type EntityField,
  type EntityIdentity,
  type Footprint,
  type Invariant,
  type RefinementOf,
  type WriteComputations,
  type WriteCondition,
  type WriteKind,
} from 'foldkit-entity'
import { Installs, type Install } from './capability.js'
import { installWrites } from './writes.js'
import { schemaOf, type SchemaOrFields, type TypeOf } from './schema.js'

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
  /**
   * What a mutation that is no `Write` says it touches, of the Entity whose
   * rows it changes: `reaches` reads a `Declared` one as it would a write's
   * members, and an `Unknown` one as it reads a handler's, which is no word at
   * all. It predicts nothing: only a `Write` shows a patch while pending.
   */
  readonly footprint?:
    | { readonly entity: EntityIdentity<string>; readonly footprint: Footprint }
    | undefined
  /** What a domain that registers the mutation installs: the code that shows it pending. */
  readonly [Installs]: Install
}

const conflict = Schema.TaggedStruct('Conflict', {})
const unmet = Schema.TaggedStruct('Unmet', {})
/**
 * Another row already holds the id an insert names: its Entity and that id,
 * both the caller's own, and nothing of the row, which may be hidden from them.
 */
const taken = Schema.TaggedStruct('Taken', { entity: Schema.String, id: Schema.String })
/**
 * The row the write would leave breaks one of its Entity's invariants: which
 * one (its Entity and its id, since an id is unique only within one), what to
 * tell the author, and the fields to show it beside. None and empty when the
 * invariant reads a member hidden from whoever asked.
 */
const invalid = Schema.TaggedStruct('Invalid', {
  entity: Schema.OptionFromOptionalNullOr(Schema.String),
  rule: Schema.OptionFromNullOr(Schema.String),
  message: Schema.String,
  path: Schema.Array(Schema.String),
})
/**
 * A delete refused because rows still point at the row through a relation
 * declared `onDelete: 'restrict'` (#467): that relation's Entity and key, and
 * nothing of the rows, which may be hidden from whoever asked.
 */
const referenced = Schema.TaggedStruct('Referenced', {
  entity: Schema.String,
  relation: Schema.String,
})
const conflictOrInvalid = Schema.Union([conflict, invalid])
const conflictUnmetOrInvalid = Schema.Union([conflict, unmet, invalid])
const takenOrInvalid = Schema.Union([taken, invalid])
/** What the constructors typed a write by: its kind, and whether it holds a `when`. */
const refusalOfWrite = (write: AnyWrite) => {
  const moved = () => (Option.isSome(write.when) ? conflictUnmetOrInvalid : conflictOrInvalid)
  return Match.value(write).pipe(
    Match.tagsExhaustive({
      Insert: (): Schema.Top => takenOrInvalid,
      Update: moved,
      Delete: (): Schema.Top => Schema.Union([...moved().members, referenced]),
    }),
  )
}
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
  /** The id an insert names is taken: another create made it, or a retry the server could not tell. */
  taken,
  /** The row the write would leave breaks an invariant of its Entity. */
  invalid,
  /** A delete of a row that rows still point at through a relation that restricts it. */
  referenced,
  /** Whether a refusal, of whatever mutation, is a `Refusal.field`. */
  isField: Schema.is(anyField),
  /** Whether a refusal, of whatever mutation, is `Refusal.conflict`. */
  isConflict: Schema.is(conflict),
  /** Whether a refusal, of whatever mutation, is `Refusal.unmet`. */
  isUnmet: Schema.is(unmet),
  /** Whether a refusal, of whatever mutation, is `Refusal.taken`. */
  isTaken: Schema.is(taken),
  /** Whether a refusal, of whatever mutation, is `Refusal.invalid`. */
  isInvalid: Schema.is(invalid),
  /** Whether a refusal, of whatever mutation, is `Refusal.referenced`. */
  isReferenced: Schema.is(referenced),
  /**
   * Whether a refusal is `Refusal.invalid` naming this invariant, by its
   * Entity and its id: the declaration `Entity.invariant` returned, once
   * attached, or one `Entity.invariants` reads. An invariant over a member
   * hidden from the asker names none, so it matches nothing.
   */
  isInvalidBy: (refusal: unknown, invariant: Pick<Invariant, 'entity' | 'id'>): boolean =>
    Schema.is(invalid)(refusal) &&
    Option.contains(refusal.entity, invariant.entity) &&
    Option.contains(refusal.rule, invariant.id),
}

type KindOf<W> = W extends { readonly _tag: infer Kind extends WriteKind } ? Kind : WriteKind

/**
 * What a declared write may be refused with: an insert as taken, an update or
 * a delete as a conflict (unmet too, when it has a `when`), a delete as
 * referenced, and every one as invalid, since the server's Entity may hold
 * invariants, and restrictions, the client's does not show. A write whose kind
 * its type leaves open may be refused as any.
 */
export type RefusalOfWrite<W> =
  | ('Insert' extends KindOf<W> ? typeof taken.Type : never)
  | ([Exclude<KindOf<W>, 'Insert'>] extends [never]
      ? never
      : W extends ConditionedWrite<any, any>
        ? typeof conflict.Type | typeof unmet.Type
        : typeof conflict.Type)
  | ('Delete' extends KindOf<W> ? typeof referenced.Type : never)
  | typeof invalid.Type

/** A mutation that is the declared write `W`, over an input of `Fields`: what `Mutation.write` returns. */
export type WriteMutation<
  Name extends string,
  Fields extends Schema.Struct.Fields,
  W,
> = MutationDescriptor<Name, Schema.Struct.Type<Fields>, {}, RefusalOfWrite<W>> & {
  readonly write: W
}

type IdSchemaOf<E extends AnyEntity> = E['fields'] extends {
  readonly id: EntityField<any, any, infer S extends Schema.Top>
}
  ? S
  : never

/**
 * The input of `Mutation.update`, `insert` and `delete`: the Entity's own `id`
 * field, naming the row, and every field the write sets, by its key.
 */
export type WriteInputFields<E extends AnyEntity, Set extends Schema.Struct.Fields> = {
  readonly [K in 'id' | keyof Set]: K extends 'id' ? IdSchemaOf<E> : Set[K & keyof Set]
}

type FieldValue<E extends AnyEntity, K extends keyof E['fields']> = Schema.Schema.Type<
  E['fields'][K]['schema']
>

/**
 * What `set` may hold: a schema per field of the Entity, by the field's key,
 * whose value the field stores (a narrower one, `Schema.Literal('published')`,
 * is how a write promises a state). An `Option` or a null is a key the input
 * may leave unset, as `Entity.input` reads it.
 */
type Settable<E extends AnyEntity, Set> = {
  readonly [K in keyof Set]: K extends 'id'
    ? 'the id names the row the write changes: it is in the input already, never set'
    : K extends keyof E['fields']
      ? Schema.Top & {
          readonly Type: FieldValue<E, K> | Option.Option<FieldValue<E, K>> | null | undefined
        }
      : `"${K & string}" is not a field of ${E['name']}`
}

/** What `update` and `insert` take beside their kind's own: the fields set, and the state it leaves. */
interface SetOptions<E extends AnyEntity, Set extends Schema.Struct.Fields> {
  /**
   * The fields the write sets, each by its key and the schema the input holds
   * it with: `{ title: Schema.String }`, or the field's own with
   * `Entity.fields(Todo, 'title')`.
   */
  readonly set: Set & Settable<E, Set>
  readonly becomes?: RefinementOf<E> | undefined
}

type UpdateOptions<E extends AnyEntity, Set extends Schema.Struct.Fields> = SetOptions<E, Set> & {
  /** The key of `set` holding the revision the row was read at: see `Write.update`. */
  readonly expect?: keyof Set & string
  readonly compute?: WriteComputations<E, WriteInputFields<E, Set>>
}

/** `Mutation.update`: conditioned when given `when` or `from`, as `Write.update` is. */
interface UpdateMutation {
  <const Name extends string, E extends AnyEntity, Set extends Schema.Struct.Fields>(
    name: Name,
    entity: E,
    options: UpdateOptions<E, Set> & {
      readonly when: WriteCondition<E, WriteInputFields<E, Set>>
      readonly from?: RefinementOf<E> | undefined
    },
  ): WriteMutation<
    Name,
    WriteInputFields<E, Set>,
    ConditionedWrite<E, WriteInputFields<E, Set>, 'Update'>
  >
  <const Name extends string, E extends AnyEntity, Set extends Schema.Struct.Fields>(
    name: Name,
    entity: E,
    options: UpdateOptions<E, Set> & { readonly when?: undefined; readonly from: RefinementOf<E> },
  ): WriteMutation<
    Name,
    WriteInputFields<E, Set>,
    ConditionedWrite<E, WriteInputFields<E, Set>, 'Update'>
  >
  <const Name extends string, E extends AnyEntity, Set extends Schema.Struct.Fields>(
    name: Name,
    entity: E,
    options: UpdateOptions<E, Set> & { readonly when?: undefined; readonly from?: undefined },
  ): WriteMutation<Name, WriteInputFields<E, Set>, Write<E, WriteInputFields<E, Set>, 'Update'>>
}

type NoFields = {}

/** `Mutation.delete`: its input is the id alone; conditioned when given `when` or `from`. */
interface DeleteMutation {
  <const Name extends string, E extends AnyEntity>(
    name: Name,
    entity: E,
    options: {
      readonly when: WriteCondition<E, WriteInputFields<E, NoFields>>
      readonly from?: RefinementOf<E> | undefined
    },
  ): WriteMutation<
    Name,
    WriteInputFields<E, NoFields>,
    ConditionedWrite<E, WriteInputFields<E, NoFields>, 'Delete'>
  >
  <const Name extends string, E extends AnyEntity>(
    name: Name,
    entity: E,
    options: { readonly when?: undefined; readonly from: RefinementOf<E> },
  ): WriteMutation<
    Name,
    WriteInputFields<E, NoFields>,
    ConditionedWrite<E, WriteInputFields<E, NoFields>, 'Delete'>
  >
  <const Name extends string, E extends AnyEntity>(
    name: Name,
    entity: E,
    options?: { readonly when?: undefined; readonly from?: undefined },
  ): WriteMutation<
    Name,
    WriteInputFields<E, NoFields>,
    Write<E, WriteInputFields<E, NoFields>, 'Delete'>
  >
}

/** The input `{ id, ...set }` read against `entity`, every key naming its own field. */
const inputOver = (entity: AnyEntity, set: Schema.Struct.Fields) =>
  Entity.input(entity, Schema.Struct({ ...Entity.fields(entity, 'id'), ...set }))

const ofWrite = <
  const Name extends string,
  Fields extends Schema.Struct.Fields,
  W extends Write<any, Fields> = Write<any, Fields>,
>(
  name: Name,
  write: W & Write<any, Fields>,
): WriteMutation<Name, Fields, W> => ({
  name,
  Input: write.input.schema as unknown as Schema.Codec<Schema.Struct.Type<Fields>>,
  Output: Schema.Struct({}),
  Refusal: refusalOfWrite(write) as unknown as Schema.Codec<RefusalOfWrite<W>, unknown>,
  write,
  [Installs]: installWrites,
})

// Each is `Mutation.write` of the long form it stands for, so the two declare the same value.
const update: UpdateMutation = (
  name: string,
  entity: AnyEntity,
  { set, ...options }: UpdateOptions<AnyEntity, Schema.Struct.Fields>,
) => ofWrite(name, Write.update(inputOver(entity, set), { ...options, id: 'id' } as never)) as never

const insert = <const Name extends string, E extends AnyEntity, Set extends Schema.Struct.Fields>(
  name: Name,
  entity: E,
  { set, becomes }: SetOptions<E, Set>,
): WriteMutation<Name, WriteInputFields<E, Set>, Write<E, WriteInputFields<E, Set>, 'Insert'>> =>
  ofWrite(name, Write.insert(inputOver(entity, set), { id: 'id', becomes }) as never) as never

const remove: DeleteMutation = (
  name: string,
  entity: AnyEntity,
  options?: { readonly when?: unknown; readonly from?: unknown },
) => ofWrite(name, Write.delete(inputOver(entity, {}), { ...options, id: 'id' } as never)) as never

export const Mutation = {
  /**
   * A mutation that is a declared `Write` (`update`, `insert` or `delete`): its
   * input is the write's, and it answers nothing but the row it changed, as a
   * patch, or its deletion. An insert may be refused as taken, when a row
   * already holds its id; an update or a delete as a conflict, when it
   * `expect`s a revision the row has moved past, and as unmet, when it has a
   * `when`; a delete as referenced, while rows point at the row through a
   * relation that restricts it; and any as invalid, when the row it would
   * leave breaks an invariant.
   *
   * `Mutation.update`, `insert` and `delete` say the common case in one call.
   */
  write: ofWrite,

  /**
   * A write that updates one row of `entity`, by its id: the same mutation as
   * `Mutation.write(name, Write.update(Entity.input(entity, input), { id: 'id',
   * ...options }))`, where `input` is the Entity's `id` field beside `set`.
   *
   * ```ts
   * const Rename = Mutation.update('Rename', Product, { set: { name: Schema.String } })
   * const Publish = Mutation.update('Publish', Product, {
   *   set: { status: Schema.Literal('published') },
   *   from: Draft,
   *   becomes: Published,
   * })
   * ```
   *
   * `when`, `from`, `becomes`, `expect` and `compute` are `Write.update`'s. An
   * input key named otherwise than its field, a relation, or a key that is
   * about the operation alone (`increment`'s amount) takes the long form.
   */
  update,

  /**
   * A write that inserts one row of `entity`, under an id the client chose:
   * `Mutation.write(name, Write.insert(Entity.input(entity, input), { id: 'id' }))`,
   * where `input` is the Entity's `id` field beside `set`.
   */
  insert,

  /**
   * A write that deletes one row of `entity`, by its id, the input's one key:
   * `Mutation.write(name, Write.delete(Entity.input(entity, input), { id: 'id' }))`.
   * `when` and `from` are `Write.delete`'s.
   */
  delete: remove,

  /**
   * Declares a mutation. `Input` and `Output` are codecs, or the fields of the
   * `Schema.Struct` they would be (`{ id: ProjectId, name: Schema.String }`).
   * `Refusal`, when given, is what the server may refuse with: a codec, usually
   * a union of `Refusal.field(...)` and `Refusal.conflict`.
   */
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
    [Installs]: installWrites,
  }),
}
