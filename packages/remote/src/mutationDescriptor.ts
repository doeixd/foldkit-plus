/**
 * Mutations as an application declares them, and what the server may refuse
 * one with. A descriptor carries the code a client runs to show the write
 * (#378), so a domain that registers none never loads it.
 */
import { Match, Option, Schema } from 'effect'
import type { AnyWrite, ConditionedWrite, Invariant, Write, WriteKind } from 'foldkit-entity'
import { Installs, type Install } from './capability.js'
import { installLayers } from './layers.js'
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
      Delete: moved,
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
 * a delete as a conflict (unmet too, when it has a `when`), and every one as
 * invalid, since the server's Entity may hold invariants the client's does
 * not show. A write whose kind its type leaves open may be refused as any.
 */
export type RefusalOfWrite<W> =
  | ('Insert' extends KindOf<W> ? typeof taken.Type : never)
  | ([Exclude<KindOf<W>, 'Insert'>] extends [never]
      ? never
      : W extends ConditionedWrite<any, any>
        ? typeof conflict.Type | typeof unmet.Type
        : typeof conflict.Type)
  | typeof invalid.Type

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
   * patch, or its deletion. An insert may be refused as taken, when a row
   * already holds its id; an update or a delete as a conflict, when it
   * `expect`s a revision the row has moved past, and as unmet, when it has a
   * `when`; and any as invalid, when the row it would leave breaks an invariant.
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
    Refusal: refusalOfWrite(write) as unknown as Schema.Codec<RefusalOfWrite<W>, unknown>,
    write,
    [Installs]: installLayers,
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
    [Installs]: installLayers,
  }),
}
