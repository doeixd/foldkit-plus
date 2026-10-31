/**
 * `foldkit-entity` — domain structure as typed values.
 *
 * An Entity names its intrinsic Fields (one `Schema.Struct`), its Relations
 * (navigation edges to other Entities, declared with `Entity.relate`), and its Derived members (readable
 * values an interpreter supplies). It describes; it fetches, stores, and
 * renders nothing. Remote, Drizzle, and form packages interpret it and attach
 * what they need as `foldkit-metadata`.
 */
import { Data, Option, type Pipeable, Schema } from 'effect'
import type { Metadata } from 'foldkit-metadata'
import type { ExprContext, NowExpr, ViewerExpr, ViewerPathExpr } from './context.js'
import type { HeldRow, HeldRows } from './held.js'
import { EntityTypeId, SelectionPageTypeId, SelectionTypeId } from './ids.js'
import type { EntitySet } from './sets.js'
// The members of `Entity`, a namespace rather than an object so a page keeps only
// those it calls (#378). Exported under the interface's name; `export * as`
// would make each `Entity` type here a reference the declaration emitter refuses.
import * as EntityMembers from './entity.js'
import type { AnyVariantUnion } from './variants.js'

export { EntityTypeId, SelectionPageTypeId, SelectionTypeId } from './ids.js'

/**
 * What makes two descriptors the same Entity. A pipe step returns a new
 * descriptor with the same identity, so compare `identity`, never the objects.
 */
export interface EntityIdentity<Name extends string> {
  readonly name: Name
  /** Distinguishes two Entities that were defined with the same name. */
  readonly token: symbol
}

/** An intrinsic value of the Entity: one property of `entity.schema`. */
export interface EntityField<Name extends string, Key extends string, S extends Schema.Constraint> {
  readonly _tag: 'Field'
  readonly owner: EntityIdentity<Name>
  readonly key: Key
  readonly schema: S
  readonly metadata: Metadata
}

export type Cardinality = 'one' | 'many'

/** What `Relation.one` / `Relation.many` return, before `Entity.relate` binds it to an owner. */
export interface RelationSpec<
  Target extends AnyEntity,
  C extends Cardinality,
  Optional extends boolean,
> {
  readonly target: Target
  readonly cardinality: C
  readonly optional: Optional
}

/**
 * A navigation edge as its owner sees it: one or many of `target`. How the edge
 * is stored (a foreign key, a join table, a nested document) is the
 * interpreter's concern.
 */
export interface EntityRelation<
  Name extends string,
  Key extends string,
  Target extends AnyEntity,
  C extends Cardinality,
  Optional extends boolean,
> {
  readonly _tag: 'Relation'
  readonly owner: EntityIdentity<Name>
  readonly key: Key
  /** The target as `Entity.relate` returned it, so its own relations can be followed. */
  readonly target: () => Target
  readonly cardinality: C
  readonly optional: Optional
  readonly metadata: Metadata
}

type OneRelation = EntityRelation<string, string, AnyEntity, 'one', boolean>

/**
 * What a derived member is. `Supplied` (`Derived.make`): an interpreter
 * supplies it, and nothing else can say what it is. `Count`
 * (`Derived.count`): how many rows point at this one through `relation`, a
 * `one` relation of the counted Entity. `Exists` (`Derived.exists`): the id of
 * a row pointing here through `relation` whose `viewer` relation points at
 * whoever reads it, or none. A client predicts both from the rows it writes,
 * and a server compiles both from the relations' storage.
 */
export type Derivation = Data.TaggedEnum<{
  /**
   * `predict`: how a client foresees it for a row it writes; none, it waits
   * for the server. `forbids`: which write to the row its value refuses, so a
   * client holding it refuses that write where it is made.
   */
  Supplied: { readonly predict: Option.Option<Predict>; readonly forbids: Option.Option<Forbids> }
  Count: { readonly relation: OneRelation }
  Exists: { readonly relation: OneRelation; readonly viewer: OneRelation }
}>
export const Derivation = Data.taggedEnum<Derivation>()

/** What a supplied member's prediction is given: the row a write leaves, as its holder has it. */
export interface Predicting {
  /** The Entity written, as the write declared it. */
  readonly entity: AnyEntity
  readonly row: HeldRow
  /** The holder's other rows, where a rule's path reads. */
  readonly rows: HeldRows
  /** The operation's context: who asks, and the write's time. */
  readonly context: ExprContext
}

/**
 * A supplied member foreseen: its value **encoded**, as the store holds it, or
 * none where the holder cannot know it, so nothing is shown before the answer.
 */
export type Predict = (predicting: Predicting) => Option.Option<unknown>

/**
 * What a write does to a row it finds, as a supplied member's `forbids` is
 * asked: an update's members and the relations it points, or a delete.
 */
export interface WriteSurface {
  readonly kind: 'Update' | 'Delete'
  /** The members it sets, moves or computes, relations not among them. */
  readonly members: ReadonlyArray<string>
  /** Each relation it points: at a row (`Link`), or at none (`Unlink`). */
  readonly relations: ReadonlyArray<{
    readonly relation: string
    readonly interaction: 'Link' | 'Unlink'
  }>
}

/**
 * Whether a supplied member's value, **encoded** as the store holds it,
 * refuses `surface`, with the reader's words for why when there are any; none
 * where it does not say so for certain. Only a definite refusal: a client
 * refuses the write unseen, and its server would refuse it too.
 */
export type Forbids = (
  value: unknown,
  surface: WriteSurface,
) => Option.Option<{ readonly reason: Option.Option<string> }>

/** What `Derived.make`, `Derived.count` or `Derived.exists` returns, before an Entity owns it. */
export interface DerivedSpec<S extends Schema.Constraint, D extends Derivation = Derivation> {
  readonly schema: S
  readonly derives: D
}

/** A value consumers may read that is not part of `entity.schema`, and what it derives. */
export interface EntityDerived<
  Name extends string,
  Key extends string,
  S extends Schema.Constraint,
  D extends Derivation = Derivation,
> {
  readonly _tag: 'Derived'
  readonly owner: EntityIdentity<Name>
  readonly key: Key
  readonly schema: S
  readonly derives: D
  readonly metadata: Metadata
}

export type EntityMember =
  | EntityField<string, string, Schema.Constraint>
  | EntityRelation<string, string, AnyEntity, Cardinality, boolean>
  | EntityDerived<string, string, Schema.Constraint>

export type RelationSpecs = Readonly<Record<string, RelationSpec<AnyEntity, Cardinality, boolean>>>
export type DerivedSpecs = Readonly<Record<string, DerivedSpec<Schema.Constraint>>>

type FieldsOf<Name extends string, Fields extends Schema.Struct.Fields> = {
  readonly [K in keyof Fields & string]: EntityField<Name, K, Fields[K]>
}
type RelationsOf<Name extends string, Relations extends RelationSpecs> = {
  readonly [K in keyof Relations & string]: Relations[K] extends RelationSpec<
    infer Target,
    infer C,
    infer Optional
  >
    ? EntityRelation<Name, K, Target, C, Optional>
    : never
}
type DerivedOf<Name extends string, Derived extends DerivedSpecs> = {
  readonly [K in keyof Derived & string]: EntityDerived<
    Name,
    K,
    Derived[K]['schema'],
    Derived[K]['derives']
  >
}

export interface Entity<
  Name extends string,
  Fields extends Schema.Struct.Fields,
  Relations extends RelationSpecs = {},
  Derived extends DerivedSpecs = {},
>
  extends Pipeable.Pipeable {
  readonly [EntityTypeId]: EntityTypeId
  readonly identity: EntityIdentity<Name>
  readonly name: Name
  /** The intrinsic value only: no relations, no derived members. */
  readonly schema: Schema.Struct<Fields>
  readonly fields: FieldsOf<Name, Fields>
  readonly relations: RelationsOf<Name, Relations>
  readonly derived: DerivedOf<Name, Derived>
  /** Every readable member under one namespace; keys never collide. */
  readonly members: FieldsOf<Name, Fields> & RelationsOf<Name, Relations> & DerivedOf<Name, Derived>
  /** The members whose value is the write's context, never its input (`Entity.sets`), by key. */
  readonly sets: Readonly<Record<string, EntitySet>>
  readonly metadata: Metadata
}

export type AnyEntity = Entity<string, any, any, any>

/**
 * An Entity whose rows are one of several shapes (`Entity.defineVariants`).
 * `variants` is Effect's tagged union of them, read with its own `match`;
 * `fields` and `schema` are the stored row, which every case shares.
 */
export interface VariantEntity<
  Name extends string,
  Fields extends Schema.Struct.Fields,
  Relations extends RelationSpecs = {},
  Derived extends DerivedSpecs = {},
  Union extends AnyVariantUnion = AnyVariantUnion,
> extends Entity<Name, Fields, Relations, Derived> {
  readonly variants: Union
}

export type AnyVariantEntity = VariantEntity<string, any, any, any, any>

/** The keys of an Entity's `one` relations. */
type OneRelationKeys<E extends AnyEntity> = {
  [K in keyof E['relations'] & string]: E['relations'][K]['cardinality'] extends 'one' ? K : never
}[keyof E['relations'] & string]

/**
 * What a field holding `T` may be set to: the time where it holds a number,
 * the viewer's id where text, and what a path from the viewer reads where it
 * holds that.
 */
type ContextValueFor<T> =
  | (number extends T ? NowExpr<number> : never)
  | (T extends string ? ViewerExpr<T> : never)
  | ViewerPathExpr<T | null>

/** The name of the Entity the `one` relation `K` points at. */
type TargetName<E extends AnyEntity, K extends keyof E['relations']> = ReturnType<
  E['relations'][K]['target']
>['name']

/**
 * What `Entity.sets` takes, by member: a field the value of the write's
 * context it can hold, a `one` relation `Expr.viewer` of its target.
 */
export type EntitySets<E extends AnyEntity> = {
  readonly [K in Exclude<keyof E['fields'] & string, 'id'>]?: ContextValueFor<
    Schema.Schema.Type<E['fields'][K]['schema']>
  >
} & {
  readonly [K in OneRelationKeys<E>]?: ViewerExpr<unknown, TargetName<E, K>>
}

export type Entities = Readonly<Record<string, AnyEntity>>
export type RelationMap<Es extends Entities> = { readonly [K in keyof Es]?: RelationSpecs }

/** The key in `Es` of the Entity a spec targets, matched by name. */
export type TargetKey<Es extends Entities, Target extends AnyEntity> = {
  [K in keyof Es]: [Es[K]['name'], Target['name']] extends [Target['name'], Es[K]['name']]
    ? K
    : never
}[keyof Es]

export type RelatedSpecs<Es extends Entities, Rs extends RelationMap<Es>, K extends keyof Es> = {
  readonly [R in keyof Rs[K]]: Rs[K][R] extends RelationSpec<infer Target, infer C, infer Optional>
    ? RelationSpec<Related<Es, Rs, TargetKey<Es, Target>>, C, Optional>
    : never
}

/**
 * One Entity of an `Entity.relate` result. A relation's target is again a
 * `Related`, so relations can be followed through a cycle; the recursion goes
 * through type arguments, which TypeScript resolves only when asked.
 */
export type Related<Es extends Entities, Rs extends RelationMap<Es>, K extends keyof Es> =
  Es[K] extends VariantEntity<infer Name, infer Fields, infer R, infer D, infer U>
    ? VariantEntity<Name, Fields, R & RelatedSpecs<Es, Rs, K>, D, U>
    : Es[K] extends Entity<infer Name, infer Fields, infer R, infer D>
      ? Entity<Name, Fields, R & RelatedSpecs<Es, Rs, K>, D>
      : never

/**
 * The schema that identifies one of an Entity: its `id` field when that is text
 * (a plain string, a brand, a pattern), and plain text otherwise. An id is text
 * because a ref travels and is stored as text; an Entity keyed by a number still
 * has refs, and their ids are the number as text.
 */
export type IdSchemaOf<E> = E extends {
  readonly fields: { readonly id: { readonly schema: infer S } }
}
  ? S extends Schema.Constraint
    ? [S['Type']] extends [string]
      ? S
      : Schema.String
    : Schema.String
  : Schema.String

/** What identifies one of an Entity: `IdOf<typeof Blog.Post>` is `PostId` when its `id` field is one. */
export type IdOf<E> = IdSchemaOf<E>['Type']

/**
 * What a relation selected with `true` yields: which Entity, and which one. `Id`
 * is the target's own id type, so a ref to an Author cannot be used as a Post's.
 */
export interface EntityRef<Name extends string = string, Id extends string = string> {
  readonly entity: Name
  readonly id: Id
}

/**
 * A view of the Entity graph: which members to read, and the schema of the
 * value that results. It says nothing about where the value comes from.
 */
export interface Selection<
  Name extends string,
  Members,
  S extends Schema.Constraint,
  Id extends string = string,
> {
  readonly [SelectionTypeId]: SelectionTypeId
  /** Type-only: the id type of the Entity selected, so a reader can ask for the right one. Never set. */
  readonly Id?: Id
  readonly entity: Entity<Name, any, any, any>
  /** What was selected, by member key: `true`, or a relation's nested Selection. */
  readonly members: Members
  readonly schema: S
}

/** The value a Selection reads: `Selected<typeof PostCard>` is one card's fields. */
export type Selected<S extends Selection<string, unknown, Schema.Constraint>> = S['schema']['Type']

/**
 * Which part of a `many` relation to read: the first or last so many, from a
 * cursor or from the end. A cursor is whatever the interpreter handed out with an
 * earlier page; nothing here looks inside it.
 */
export interface PageWindow {
  readonly first?: number | undefined
  readonly last?: number | undefined
  readonly after?: string | undefined
  readonly before?: string | undefined
}

/** A Selection of a `many` relation's target, read a page at a time. */
export interface SelectionPage<Name extends string, S extends Schema.Constraint> {
  readonly [SelectionPageTypeId]: SelectionPageTypeId
  readonly selection: Selection<Name, any, S>
  readonly window: PageWindow
}

/** An input key that carries a relation's target: the id of a `one`, the ids of a `many`. */
export interface RelationInput<R extends EntityRelation<any, any, any, any, any>> {
  readonly _tag: 'RelationInput'
  readonly relation: R
}

/**
 * An input key that carries the relation's target itself, written through an
 * input of its own: a post created with a new author, an order with its lines.
 * A `one` holds that input's value, a `many` a list of them.
 */
export interface NestedInput<
  R extends EntityRelation<any, any, any, any, any>,
  I extends EntityInput<any, any, any>,
> {
  readonly _tag: 'NestedInput'
  readonly relation: R
  readonly input: I
}

/** An input key that is about the operation, not the Entity: a reason, a flag, a confirmation. */
export interface Unmapped {
  readonly _tag: 'Unmapped'
}

/** What one key of an operation's input means in terms of the Entity. */
export type InputMember =
  | EntityField<string, string, Schema.Constraint>
  | RelationInput<EntityRelation<string, string, AnyEntity, Cardinality, boolean>>
  | NestedInput<
      EntityRelation<string, string, AnyEntity, Cardinality, boolean>,
      EntityInput<AnyEntity, any, any>
    >
  | Unmapped

/**
 * An operation's input read against an Entity: which member each input key
 * writes. The operation decides what may be submitted; the Entity only says
 * what each submitted key means.
 */
export interface EntityInput<E extends AnyEntity, Fields extends Schema.Struct.Fields, Members> {
  readonly entity: E
  readonly schema: Schema.Struct<Fields>
  readonly members: Members
}

export type { InputMembers, WrittenAs, WrittenKey, WrittenSpec } from './entity.js'
export { EntityMembers as Entity }

function one<Target extends AnyEntity>(target: Target): RelationSpec<Target, 'one', false>
function one<Target extends AnyEntity, const Optional extends boolean>(
  target: Target,
  options: { readonly optional: Optional },
): RelationSpec<Target, 'one', Optional>
function one(
  target: AnyEntity,
  options?: { readonly optional: boolean },
): RelationSpec<AnyEntity, 'one', boolean> {
  return { target, cardinality: 'one', optional: options?.optional ?? false }
}

/** What the owner sees: one or many of `target`. Used inside `Entity.relate`. */
export const Relation = {
  one,

  /** For `Entity.input`: the input key holds this relation's target id, or ids for a `many`. */
  input: <R extends EntityRelation<any, any, any, any, any>>(relation: R): RelationInput<R> =>
    Object.freeze({ _tag: 'RelationInput', relation }),

  /**
   * For `Entity.input`: the input key holds the relation's target itself, written
   * through `input`, an `Entity.input` of the target. A `many` holds a list.
   */
  nested: <R extends EntityRelation<any, any, any, any, any>, I extends EntityInput<any, any, any>>(
    relation: R,
    input: I,
  ): NestedInput<R, I> => Object.freeze({ _tag: 'NestedInput', relation, input }),

  many: <Target extends AnyEntity>(target: Target): RelationSpec<Target, 'many', false> => ({
    target,
    cardinality: 'many',
    optional: false,
  }),
}

/** A count: never negative, never a fraction. */
const CountSchema = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

/** The id of the row an exists found, as every Remote id is held: text, or none. */
const WitnessSchema = Schema.OptionFromNullOr(Schema.String)

type OwnerName<R> = R extends EntityRelation<infer Name, any, any, any, any> ? Name : never

export const Derived = {
  /**
   * A member only an interpreter can compute, of type `schema`: it supplies the
   * value. `predict` says how a client foresees it for a row it writes (Guard's
   * `may`); without it the row reads as missing the member until the answer.
   * `forbids` says which write to the row its value refuses (Guard's `may`
   * again), so a client holding it refuses that write where it is made.
   */
  make: <S extends Schema.Constraint>(
    schema: S,
    options: {
      readonly predict?: Predict | undefined
      readonly forbids?: Forbids | undefined
    } = {},
  ): DerivedSpec<S, Extract<Derivation, { readonly _tag: 'Supplied' }>> => ({
    schema,
    derives: Derivation.Supplied({
      predict: Option.fromUndefinedOr(options.predict),
      forbids: Option.fromUndefinedOr(options.forbids),
    }),
  }),

  /**
   * How many rows point at this one through `relation`, a `one` relation of
   * the counted Entity: `likeCount: Derived.count(Like.relations.post)` on
   * Post. Added after `Entity.relate`, which makes the relation. A server
   * compiles it from the relation's storage, and a client predicts it from
   * the rows a pending write inserts, deletes or points elsewhere.
   */
  count: <R extends EntityRelation<string, string, AnyEntity, 'one', boolean>>(
    relation: R,
  ): DerivedSpec<typeof CountSchema, { readonly _tag: 'Count'; readonly relation: R }> => ({
    schema: CountSchema,
    derives: Derivation.Count({ relation }) as { readonly _tag: 'Count'; readonly relation: R },
  }),

  /**
   * Whether a row points at this one through `relation` and at whoever reads
   * it through `viewer`, another `one` relation of the same pointing Entity:
   * `liked: Derived.exists(Like.relations.post, { viewer: Like.relations.user })`
   * on Post. Its value is that row's id as the store holds it, or none, so the
   * reader can take it back (`Write.delete` by that id). It depends on who
   * reads it: a server answers it for the principal it reads as, and a client
   * predicts it for the viewer it is told of.
   */
  exists: <
    R extends OneRelation,
    V extends EntityRelation<OwnerName<R>, string, AnyEntity, 'one', boolean>,
  >(
    relation: R,
    options: { readonly viewer: V },
  ): DerivedSpec<
    typeof WitnessSchema,
    { readonly _tag: 'Exists'; readonly relation: R; readonly viewer: V }
  > => ({
    schema: WitnessSchema,
    derives: Derivation.Exists({ relation, viewer: options.viewer }) as {
      readonly _tag: 'Exists'
      readonly relation: R
      readonly viewer: V
    },
  }),
}

export * from './expr.js'
export {
  contextValue,
  viewerIdOf,
  type ExprContext,
  type NowExpr,
  type ViewerExpr,
  type ViewerPathExpr,
} from './context.js'
export * from './collation.js'
export * from './operators.js'
export * from './law.js'
export * from './text.js'
export * from './readFilter.js'
export * from './words.js'
export * from './shape.js'
export type {
  AnyVariantUnion,
  CheckCases,
  EntityVariants,
  StoredFields,
  VariantCases,
  VariantUnion,
} from './variants.js'
// The reference semantics of the IR above. The conformance suite that proves
// an interpreter agrees with it is `foldkit-entity/conformance`, kept out of
// this entry because it is fixture data every form and admin screen would
// otherwise carry.
export * from './evaluate.js'
export * from './held.js'
export type {
  AfterRow,
  BeforeRow,
  Change,
  DeclaredInvariant,
  Invariant,
  Judgement,
} from './invariant.js'
export type { ContextValue, EntitySet, SetOn } from './sets.js'
export {
  Write,
  type AnyWrite,
  type BoundWrite,
  type ConditionedWrite,
  Computation,
  type WriteAssignment,
  type WriteComputations,
  type WriteCondition,
  type WriteIncrement,
  type WriteKind,
  type WriteLink,
  type WriteSet,
  type ContextSet,
  type ContextRead,
  type ContextValues,
} from './write.js'
