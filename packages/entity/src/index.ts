/**
 * `foldkit-entity` — domain structure as typed values.
 *
 * An Entity names its intrinsic Fields (one `Schema.Struct`), its Relations
 * (navigation edges to other Entities), and its Derived members (readable
 * values an interpreter supplies). It describes; it fetches, stores, and
 * renders nothing. Remote, Drizzle, and form packages interpret it and attach
 * what they need as `foldkit-metadata`.
 */
import { Pipeable, type Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'

export const EntityTypeId: unique symbol = Symbol.for('foldkit-entity/Entity')
export type EntityTypeId = typeof EntityTypeId

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

/** What `Relation.one` / `Relation.many` return, before an Entity owns it. */
export interface RelationSpec<
  Target extends AnyEntity,
  C extends Cardinality,
  Optional extends boolean,
> {
  readonly target: () => Target
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
  /** Lazy so Entities can refer to each other; throws if it yields a non-Entity. */
  readonly target: () => Target
  readonly cardinality: C
  readonly optional: Optional
  readonly metadata: Metadata
}

/** What `Derived.make` returns, before an Entity owns it. */
export interface DerivedSpec<S extends Schema.Constraint> {
  readonly schema: S
}

/**
 * A value consumers may read that is not part of `entity.schema`. It says
 * nothing about how the value is computed; an interpreter supplies it.
 */
export interface EntityDerived<
  Name extends string,
  Key extends string,
  S extends Schema.Constraint,
> {
  readonly _tag: 'Derived'
  readonly owner: EntityIdentity<Name>
  readonly key: Key
  readonly schema: S
  readonly metadata: Metadata
}

export type EntityMember =
  | EntityField<string, string, Schema.Constraint>
  | EntityRelation<string, string, AnyEntity, Cardinality, boolean>
  | EntityDerived<string, string, Schema.Constraint>

type RelationSpecs = Readonly<Record<string, RelationSpec<AnyEntity, Cardinality, boolean>>>
type DerivedSpecs = Readonly<Record<string, DerivedSpec<Schema.Constraint>>>

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
  readonly [K in keyof Derived & string]: EntityDerived<Name, K, Derived[K]['schema']>
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
  readonly metadata: Metadata
}

export type AnyEntity = Entity<string, any, any, any>

/** Unsatisfiable when a new key is already a member, so the pipe step is the error site. */
type Free<E extends AnyEntity, New> = keyof New & keyof E['members'] extends never
  ? unknown
  : { readonly alreadyAMember: keyof New & keyof E['members'] }

type WithRelations<E, New extends RelationSpecs> =
  E extends Entity<infer Name, infer Fields, infer R, infer D>
    ? Entity<Name, Fields, R & New, D>
    : never
type WithDerived<E, New extends DerivedSpecs> =
  E extends Entity<infer Name, infer Fields, infer R, infer D>
    ? Entity<Name, Fields, R, D & New>
    : never

interface Parts {
  readonly identity: EntityIdentity<string>
  readonly schema: Schema.Struct<Schema.Struct.Fields>
  readonly fields: Readonly<Record<string, EntityMember>>
  readonly relations: Readonly<Record<string, EntityMember>>
  readonly derived: Readonly<Record<string, EntityMember>>
  readonly metadata: Metadata
}

const EntityProto = {
  [EntityTypeId]: EntityTypeId,
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  },
}

const make = (parts: Parts): AnyEntity =>
  Object.freeze(
    Object.assign(Object.create(EntityProto), parts, {
      name: parts.identity.name,
      fields: Object.freeze(parts.fields),
      relations: Object.freeze(parts.relations),
      derived: Object.freeze(parts.derived),
      members: Object.freeze({ ...parts.fields, ...parts.relations, ...parts.derived }),
    }),
  )

const isEntity = (value: unknown): value is AnyEntity =>
  typeof value === 'object' && value !== null && EntityTypeId in value

const kindOf = (entity: AnyEntity, key: string): string | undefined =>
  (entity.members as Readonly<Record<string, EntityMember>>)[key]?._tag.toLowerCase()

const assertFree = (entity: AnyEntity, keys: ReadonlyArray<string>, adding: string): void => {
  for (const key of keys) {
    const kind = kindOf(entity, key)
    if (kind !== undefined)
      throw new Error(
        `Entity "${entity.name}": cannot add ${adding} "${key}", it is already a ${kind}`,
      )
  }
}

const mapValues = <A, B>(
  record: Readonly<Record<string, A>>,
  f: (value: A, key: string) => B,
): Record<string, B> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, f(value, key)]))

export const Entity = {
  /** Declares an Entity from its intrinsic fields. Each call is a new identity. */
  define: <const Name extends string, Fields extends Schema.Struct.Fields>(
    name: Name,
    schema: Schema.Struct<Fields>,
  ): Entity<Name, Fields> => {
    const identity: EntityIdentity<Name> = Object.freeze({ name, token: Symbol(name) })
    return make({
      identity,
      schema,
      fields: mapValues(schema.fields, (fieldSchema, key) =>
        Object.freeze({
          _tag: 'Field',
          owner: identity,
          key,
          schema: fieldSchema,
          metadata: Metadata.empty,
        }),
      ),
      relations: {},
      derived: {},
      metadata: Metadata.empty,
    }) as Entity<Name, Fields>
  },

  /** Adds navigation edges. A key that is already a member is an error. */
  relations:
    <const New extends RelationSpecs>(specs: New) =>
    <E extends AnyEntity>(entity: E & Free<E, New>): WithRelations<E, New> => {
      assertFree(entity, Object.keys(specs), 'relation')
      const added = mapValues<RelationSpec<AnyEntity, Cardinality, boolean>, EntityMember>(
        specs,
        (spec, key) =>
          Object.freeze({
            _tag: 'Relation',
            owner: entity.identity,
            key,
            target: () => {
              const target = spec.target()
              if (!isEntity(target))
                throw new Error(
                  `Entity "${entity.name}": relation "${key}" does not resolve to an Entity`,
                )
              return target
            },
            cardinality: spec.cardinality,
            optional: spec.optional,
            metadata: Metadata.empty,
          }),
      )
      return make({ ...entity, relations: { ...entity.relations, ...added } }) as never
    },

  /** Adds readable members that are not part of `entity.schema`. */
  derived:
    <const New extends DerivedSpecs>(specs: New) =>
    <E extends AnyEntity>(entity: E & Free<E, New>): WithDerived<E, New> => {
      assertFree(entity, Object.keys(specs), 'derived member')
      const added = mapValues<DerivedSpec<Schema.Constraint>, EntityMember>(specs, (spec, key) =>
        Object.freeze({
          _tag: 'Derived',
          owner: entity.identity,
          key,
          schema: spec.schema,
          metadata: Metadata.empty,
        }),
      )
      return make({ ...entity, derived: { ...entity.derived, ...added } }) as never
    },

  /** Attaches an interpreter's metadata to the Entity itself. */
  annotate:
    (metadata: Metadata) =>
    <E extends AnyEntity>(entity: E): E =>
      make({ ...entity, metadata: Metadata.combine([entity.metadata, metadata]) }) as E,

  /** Attaches an interpreter's metadata to members, by key. */
  annotateMembers:
    <E extends AnyEntity>(metadata: { readonly [K in keyof E['members']]?: Metadata }) =>
    (entity: E): E => {
      const given = metadata as Readonly<Record<string, Metadata | undefined>>
      for (const key of Object.keys(given))
        if (kindOf(entity, key) === undefined)
          throw new Error(`Entity "${entity.name}": cannot annotate "${key}", it is not a member`)
      const annotate = (members: Readonly<Record<string, EntityMember>>) =>
        mapValues(members, (member, key) => {
          const extra = given[key]
          return extra === undefined
            ? member
            : Object.freeze({ ...member, metadata: Metadata.combine([member.metadata, extra]) })
        })
      return make({
        ...entity,
        fields: annotate(entity.fields),
        relations: annotate(entity.relations),
        derived: annotate(entity.derived),
      }) as E
    },

  is: isEntity,

  /** True when both descriptors are versions of one Entity. */
  same: (left: AnyEntity, right: AnyEntity): boolean =>
    left.identity.token === right.identity.token,
}

function one<Target extends AnyEntity>(target: () => Target): RelationSpec<Target, 'one', false>
function one<Target extends AnyEntity, const Optional extends boolean>(
  target: () => Target,
  options: { readonly optional: Optional },
): RelationSpec<Target, 'one', Optional>
function one(
  target: () => AnyEntity,
  options?: { readonly optional: boolean },
): RelationSpec<AnyEntity, 'one', boolean> {
  return { target, cardinality: 'one', optional: options?.optional ?? false }
}

export const Relation = {
  one,

  many: <Target extends AnyEntity>(target: () => Target): RelationSpec<Target, 'many', false> => ({
    target,
    cardinality: 'many',
    optional: false,
  }),
}

export const Derived = {
  make: <S extends Schema.Constraint>(schema: S): DerivedSpec<S> => ({ schema }),
}
