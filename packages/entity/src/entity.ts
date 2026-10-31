/**
 * The `Entity` namespace: declaring Entities, their relations and derived
 * members, and Selections and inputs over them. An ES module rather than an
 * object, so a page keeps only the members it calls: one that declares and
 * reads Entities keeps none of the invariant judge or its expression
 * evaluator (#378).
 */
import { Option, Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { extend, make, mapValues, partsOf, remake, variantBases } from './descriptor.js'
import type { OneRelation } from './expr.js'
import { EntityTypeId, SelectionPageTypeId, SelectionTypeId } from './ids.js'
import {
  Derivation,
  type AnyEntity,
  type Cardinality,
  type DerivedSpec,
  type DerivedSpecs,
  type Entities,
  type Entity,
  type EntityDerived,
  type EntityField,
  type EntityIdentity,
  type EntityInput,
  type EntityMember,
  type EntityRelation,
  type EntitySets,
  type IdOf,
  type IdSchemaOf,
  type InputMember,
  type NestedInput,
  type PageWindow,
  type Related,
  type RelationInput,
  type RelationMap,
  type RelationSpec,
  type RelationSpecs,
  type Selection,
  type SelectionPage,
  type Unmapped,
  type VariantEntity,
} from './index.js'
import { own, put } from './record.js'
import { checkedSet, type EntitySet, type SetOn } from './sets.js'
import { SchemaShape } from './shape.js'
import {
  declareVariants,
  registerVariants,
  variantsOf as variantsOfIdentity,
  type CheckCases,
  type EntityVariants,
  type StoredFields,
  type VariantCases,
  type VariantUnion,
} from './variants.js'

// What the signatures below check with. Not exported: a consumer's declaration
// then writes out what one resolves to instead of naming a module the
// package does not export.

/** Unsatisfiable when a new key is already a member, so the pipe step is the error site. */
type Free<E extends AnyEntity, New> = keyof New & keyof E['members'] extends never
  ? unknown
  : { readonly alreadyAMember: keyof New & keyof E['members'] }

/** Unsatisfiable when a `Derived.count` or `Derived.exists` names a relation pointing at another Entity. */
type PointsHere<E extends AnyEntity, New extends DerivedSpecs> = {
  [K in keyof New]: New[K]['derives'] extends {
    readonly _tag: 'Count' | 'Exists'
    readonly relation: EntityRelation<any, any, infer Target, any, any>
  }
    ? [Target['name']] extends [E['name']]
      ? never
      : K
    : never
}[keyof New] extends infer Wrong
  ? [Wrong] extends [never]
    ? unknown
    : { readonly countsRowsPointingAtAnotherEntity: Wrong }
  : never

type WithDerived<E, New extends DerivedSpecs> =
  E extends VariantEntity<infer Name, infer Fields, infer R, infer D, infer U>
    ? VariantEntity<Name, Fields, R, D & New, U>
    : E extends Entity<infer Name, infer Fields, infer R, infer D>
      ? Entity<Name, Fields, R, D & New>
      : never

/** Marks a relation key that is already a member of its owner, or an owner that is not listed. */
type CheckRelations<Es extends Entities, Rs> = {
  readonly [K in keyof Rs]: K extends keyof Es
    ? {
        readonly [R in keyof Rs[K]]: R extends keyof Es[K]['members']
          ? `"${R & string}" is already a member of ${Es[K]['name']}`
          : Rs[K][R]
      }
    : 'not one of the entities being related'
}

type RefSchema<Target extends AnyEntity> = Schema.Struct<{
  readonly entity: Schema.Literal<Target['name']>
  readonly id: IdSchemaOf<Target>
}>

type AnySelection<Name extends string = string> = Selection<Name, any, any>

type PageSchema<S extends Schema.Constraint> = Schema.Struct<{
  readonly items: Schema.$Array<S>
  readonly hasNext: Schema.Boolean
  readonly hasPrevious: Schema.Boolean
}>

/** A variant Entity's cases, by tag, as the field sets of its union (`_tag` among them); never for one shape. */
type CaseFieldSets<E> = E extends {
  readonly variants: {
    readonly cases: infer C extends Readonly<
      Record<string, { readonly fields: Schema.Struct.Fields }>
    >
  }
}
  ? { readonly [T in keyof C & string]: C[T]['fields'] }
  : never

/** Whether `K` is a field only some cases have, selected without `_tag` to say which case a row is. */
type CaseOnlyWithoutTag<E extends AnyEntity, K, Spec> = [CaseFieldSets<E>] extends [never]
  ? false
  : '_tag' extends keyof Spec
    ? false
    : K extends keyof E['fields']
      ? K extends keyof CaseFieldSets<E>[keyof CaseFieldSets<E>]
        ? false
        : true
      : false

/** `true` for any member; a relation also takes a Selection of its target. */
type SelectionSpec<E extends AnyEntity, Spec> = {
  readonly [K in keyof Spec]: K extends keyof E['relations']
    ? E['relations'][K] extends EntityRelation<any, any, infer Target, infer C, any>
      ?
          | true
          | AnySelection<Target['name']>
          // Only a `many` relation has pages.
          | (C extends 'many' ? SelectionPage<Target['name'], any> : never)
      : never
    : K extends keyof E['members']
      ? CaseOnlyWithoutTag<E, K, Spec> extends true
        ? `"${K & string}" is a field of some cases of ${E['name']}; select _tag with it`
        : true
      : `"${K & string}" is not a member of ${E['name']}`
}

type RelationShape<
  C extends Cardinality,
  Optional extends boolean,
  S extends Schema.Constraint,
> = C extends 'many' ? Schema.$Array<S> : Optional extends true ? Schema.NullOr<S> : S

type SelectedSchema<Member, Selected> = Member extends
  | EntityField<any, any, infer S>
  | EntityDerived<any, any, infer S>
  ? S
  : Member extends EntityRelation<any, any, infer Target, infer C, infer Optional>
    ? Selected extends SelectionPage<any, infer S>
      ? PageSchema<S>
      : RelationShape<
          C,
          Optional,
          Selected extends Selection<any, any, infer S> ? S : RefSchema<Target>
        >
    : never

type FlatSelectionSchema<E extends AnyEntity, Spec> = Schema.Struct<{
  readonly [K in keyof Spec & keyof E['members']]: SelectedSchema<E['members'][K], Spec[K]>
}>

/** What one case holds of a Selection: the selected fields it has, as it holds them, and every other member. */
type CaseSelectionFields<E extends AnyEntity, Spec, Fields> = {
  readonly [
    K in Exclude<keyof Spec & keyof E['members'], '_tag'> as K extends keyof E['fields']
      ? K extends keyof Fields
        ? K
        : never
      : K
  ]: K extends keyof Fields ? Fields[K] : SelectedSchema<E['members'][K], Spec[K]>
}

/**
 * A Selection's schema: a Struct, or, for a variant Entity whose `_tag` is
 * selected, a tagged union with a case per variant.
 */
type SelectionSchema<E extends AnyEntity, Spec> = [CaseFieldSets<E>] extends [never]
  ? FlatSelectionSchema<E, Spec>
  : '_tag' extends keyof Spec
    ? Schema.TaggedUnion<{
        readonly [T in keyof CaseFieldSets<E> & string]: Schema.TaggedStruct<
          T,
          CaseSelectionFields<E, Spec, CaseFieldSets<E>[T]>
        >
      }>
    : FlatSelectionSchema<E, Spec>

/** The ids a relation takes as input: one id, a nullable id, or a list of ids. */
type RelationIds<R> =
  R extends EntityRelation<any, any, infer Target, infer C, infer Optional>
    ? C extends 'many'
      ? ReadonlyArray<IdOf<Target>>
      : Optional extends true
        ? IdOf<Target> | null
        : IdOf<Target>
    : never

/** What a nested input takes: the value of the target's input, or a list of them for a `many`. */
type NestedValues<R, I> =
  I extends EntityInput<any, infer Fields, any>
    ? R extends EntityRelation<any, any, any, 'many', any>
      ? ReadonlyArray<Schema.Struct.Type<Fields>>
      : Schema.Struct.Type<Fields>
    : never

type Present<T> = Exclude<T, null | undefined>

/** What an `Option` holds, else the value itself. */
type Held<T> =
  T extends Option.Some<infer A> ? Present<A> : T extends Option.None<any> ? never : Present<T>

/**
 * Whether an input value fits a field. Only the value that is present has to
 * fit: an input may leave a key out (a partial update), send `null` to clear
 * it, or hold an `Option` (an id absent for something new), whose value fits as
 * it is (an `Option` field) or as what it holds. Whether it may is the input
 * schema's rule; the fit only guards against mapping the wrong member.
 */
type Fits<Input, Field> = [Present<Input>] extends [Field]
  ? true
  : [Held<Input>] extends [Field]
    ? true
    : false

type MappingFor<Name extends string, Input, M> = M extends Unmapped
  ? M
  : M extends
        | EntityField<infer Owner, any, any>
        | RelationInput<EntityRelation<infer Owner, any, any, any, any>>
        | NestedInput<EntityRelation<infer Owner, any, any, any, any>, any>
    ? [Owner] extends [Name]
      ? M extends EntityField<any, any, infer S>
        ? Fits<Input, Schema.Schema.Type<S>> extends true
          ? M
          : 'the input value does not fit this field'
        : M extends RelationInput<infer R>
          ? Present<Input> extends RelationIds<R>
            ? M
            : 'the input value is not the id shape of this relation'
          : M extends NestedInput<infer R, infer I>
            ? R extends EntityRelation<any, any, infer Target, any, any>
              ? I extends EntityInput<infer Of, any, any>
                ? [Of['name']] extends [Target['name']]
                  ? Present<Input> extends NestedValues<R, I>
                    ? M
                    : 'the input value is not the value of the nested input'
                  : `the nested input is of ${Of['name']}, not ${Target['name']}`
                : never
              : never
            : never
      : `this member belongs to ${Owner}`
    : 'map an input key to a Field, Relation.input(relation), Relation.nested(relation, input), or Entity.unmapped'

/** A key that names a field whose value it fits maps itself; every other key needs an entry. */
type SelfMapped<E extends AnyEntity, Fields extends Schema.Struct.Fields> = {
  [K in keyof Fields]: K extends keyof E['fields']
    ? Fits<Schema.Schema.Type<Fields[K]>, Schema.Schema.Type<E['fields'][K]['schema']>> extends true
      ? K
      : never
    : never
}[keyof Fields]

/**
 * A mapping written as a member's key: `'title'` is that Field, and `'author'` is
 * `Relation.input` of that relation. Nothing is inferred from the input key's own
 * name; the member is still named, only more briefly.
 */
type Named<E extends AnyEntity, M> = M extends string
  ? M extends keyof E['fields']
    ? E['fields'][M]
    : M extends keyof E['relations']
      ? RelationInput<E['relations'][M]>
      : `"${M}" names no field or relation of ${E['name']}`
  : M

type InputMapping<E extends AnyEntity, Fields extends Schema.Struct.Fields, Mapping> = {
  readonly [K in Exclude<keyof Fields, SelfMapped<E, Fields>>]: unknown
} & {
  readonly [K in keyof Mapping]: K extends keyof Fields
    ? Named<E, Mapping[K]> extends infer Member
      ? Member extends string
        ? Member
        : MappingFor<E['name'], Schema.Schema.Type<Fields[K]>, Member> extends Member
          ? Mapping[K]
          : MappingFor<E['name'], Schema.Schema.Type<Fields[K]>, Member>
      : never
    : `"${K & string}" is not a key of the input`
}

/** The member each key of an input writes, as `Entity.input` reads it from a mapping. */
export type InputMembers<E extends AnyEntity, Fields extends Schema.Struct.Fields, Mapping> = {
  readonly [K in keyof Fields]: K extends keyof Mapping
    ? Named<E, Mapping[K]>
    : K extends keyof E['fields']
      ? E['fields'][K]
      : never
}

/** The Entity member an input key writes, by its key; nothing for an unmapped key. */
export type WrittenKey<M> =
  M extends EntityField<any, infer Key, any>
    ? Key
    : M extends
          | RelationInput<EntityRelation<any, infer Key, any, any, any>>
          | NestedInput<EntityRelation<any, infer Key, any, any, any>, any>
      ? Key
      : never

/** A nested input reads what it writes of the target; every other member reads as it is. */
export type WrittenAs<M> =
  M extends NestedInput<any, EntityInput<infer Of, any, infer Members>>
    ? Selection<Of['name'], WrittenSpec<Members>, SelectionSchema<Of, WrittenSpec<Members>>>
    : true

/** Every member the input writes: what to read to show the input's current values. */
export type WrittenSpec<Members> = {
  readonly [K in keyof Members as WrittenKey<Members[K]>]: WrittenAs<Members[K]>
}

/** The `id` field's schema when it is text, so a ref's id keeps its brand and its checks; else text. */
const idSchemaOf = (entity: AnyEntity): Schema.Top => {
  const fields: Readonly<Record<string, EntityMember | undefined>> = entity.fields
  const id = fields.id
  if (id === undefined || id._tag !== 'Field') return Schema.String
  const type = Schema.toType(id.schema as Schema.Top)
  return SchemaShape.isText(type.ast) ? type : Schema.String
}

/**
 * The schema a Selection of `entity` reads, given each selected member's
 * schema by key: a Struct, or, for a variant Entity whose `_tag` is among
 * them, its tagged union (each case keeps the selected fields it has, as it
 * holds them). An interpreter that reads members its own way (Remote reads a
 * relation as a ref) builds a Selection's value with it.
 *
 * A variant Entity's Selection: with `_tag`, a tagged union whose cases hold
 * the selected fields they have, each as the case holds it, and every
 * selected relation and derived member; without it, the stored row's Struct,
 * refused when it selects a field only some cases have.
 */
export const selectionSchema = (
  entity: AnyEntity,
  selected: Readonly<Record<string, Schema.Constraint>>,
): Schema.Top =>
  Option.match(variantsOfIdentity(entity.identity), {
    onNone: () => Schema.Struct(selected),
    onSome: variants => variantSelection(entity, variants, selected),
  })

const variantSelection = (
  entity: AnyEntity,
  variants: EntityVariants,
  selected: Readonly<Record<string, Schema.Constraint>>,
): Schema.Top => {
  const caseOnly = (key: string) =>
    Object.hasOwn(entity.fields, key) &&
    key !== '_tag' &&
    variants.tags.some(tag => !Object.hasOwn(variants.cases[tag]!, key))
  if (!Object.hasOwn(selected, '_tag')) {
    const untold = Object.keys(selected).filter(caseOnly)
    if (untold.length > 0)
      fail(
        entity,
        `${untold.join(', ')} ${untold.length === 1 ? 'is a field' : 'are fields'} of some cases; select _tag with ${untold.length === 1 ? 'it' : 'them'}`,
      )
    return Schema.Struct(selected)
  }
  const cases: Record<string, Schema.Struct.Fields> = {}
  for (const tag of variants.tags) {
    const own = variants.cases[tag]!
    const fields: Record<string, Schema.Constraint> = {}
    for (const [key, schema] of Object.entries(selected)) {
      if (key === '_tag') continue
      if (!Object.hasOwn(entity.fields, key)) put(fields, key, schema)
      else if (Object.hasOwn(own, key)) put(fields, key, own[key]!)
    }
    put(cases, tag, fields)
  }
  return Schema.TaggedUnion(cases)
}

const isSelectionPage = (value: unknown): value is SelectionPage<string, Schema.Constraint> =>
  typeof value === 'object' && value !== null && SelectionPageTypeId in value

const isSelection = (value: unknown): value is AnySelection =>
  typeof value === 'object' && value !== null && SelectionTypeId in value

/** For an input key that is about the operation rather than the Entity. */
export const unmapped: Unmapped = Object.freeze({ _tag: 'Unmapped' })

/** True when both descriptors are versions of one Entity. */
const isSameEntity = (left: AnyEntity, right: AnyEntity): boolean =>
  left.identity.token === right.identity.token

const fail = (entity: AnyEntity, message: string): never => {
  throw new Error(`Entity "${entity.name}": ${message}`)
}

const isEntity = (value: unknown): value is AnyEntity =>
  typeof value === 'object' && value !== null && EntityTypeId in value

const kindName = { Field: 'field', Relation: 'relation', Derived: 'derived member' } as const

const kindOf = (entity: AnyEntity, key: string): string | undefined => {
  const member = (entity.members as Readonly<Record<string, EntityMember>>)[key]
  return member && kindName[member._tag]
}

const assertFree = (entity: AnyEntity, keys: ReadonlyArray<string>, adding: string): void => {
  for (const key of keys) {
    const kind = kindOf(entity, key)
    if (kind !== undefined)
      throw new Error(
        `Entity "${entity.name}": cannot add ${adding} "${key}", it is already a ${kind}`,
      )
  }
}

/** Declares an Entity from its intrinsic fields. Each call is a new identity. */
export const define = <const Name extends string, Fields extends Schema.Struct.Fields>(
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
    annotated: {},
    metadata: Metadata.empty,
  }) as Entity<Name, Fields>
}

/**
 * Declares an Entity whose rows are one of several shapes, each case's fields
 * by its tag:
 *
 * ```ts
 * const Domain = Entity.defineVariants('Domain', {
 *   Available: { ...DomainName.fields, ...DomainQuote.fields },
 *   Unconfirmed: DomainName.fields,
 * })
 * Domain.variants.match(row, { Available: ({ price }) => price, Unconfirmed: () => 0 })
 * ```
 *
 * A row is `Domain.variants`, Effect's tagged union of the cases. The stored
 * row is `fields` and `schema`: `_tag`, the fields every case has, and each
 * other field nullable, null on a row of another case. Each case with fields
 * of its own gets an invariant saying so (`variant_Available`), which a
 * database binding writes as a CHECK. A key in several cases is one stored
 * field, so it is declared with one schema, spread into each case. Refused
 * here: fewer than two cases, a case declaring `_tag`, an optional key.
 */
export const defineVariants = <const Name extends string, const Cases extends VariantCases>(
  name: Name,
  cases: Cases & CheckCases<Cases>,
): VariantEntity<Name, StoredFields<Cases>, {}, {}, VariantUnion<Cases>> => {
  const { fields, variants } = declareVariants(name, cases)
  const declared = define(name, Schema.Struct(fields))
  registerVariants(declared.identity, declared.schema, variants)
  // Made again so the descriptor reads the variants just registered.
  const entity = remake(declared, {})
  // Each case's invariant is built from it when first read (`Entity.invariants`).
  variantBases.set(entity.identity, entity)
  return entity as never
}

/**
 * An Entity's variants as an interpreter reads them: the union, each case's
 * fields, and the codec from a stored row to its case. None for an Entity of
 * one shape.
 */
export const variantsOf = (entity: AnyEntity): Option.Option<EntityVariants> =>
  variantsOfIdentity(entity.identity)

/**
 * Declares the relations between a set of Entities in one step, and returns
 * them related. One step, because Entities that point at each other cannot
 * each be declared in terms of the other.
 */
export const relate = <const Es extends Entities, const Rs extends RelationMap<Es>>(
  entities: Es,
  relations: Rs & CheckRelations<Es, Rs>,
): { readonly [K in keyof Es]: Related<Es, Rs, K> } => {
  const keyByToken = new Map<symbol, string>()
  for (const [key, entity] of Object.entries(entities)) {
    if (!isEntity(entity)) throw new Error(`Entity.relate: "${key}" is not an Entity`)
    const earlier = keyByToken.get(entity.identity.token)
    if (earlier !== undefined)
      throw new Error(`Entity.relate: "${earlier}" and "${key}" are the same Entity`)
    keyByToken.set(entity.identity.token, key)
  }
  const given: Readonly<Record<string, RelationSpecs | undefined>> = relations
  for (const owner of Object.keys(given))
    if (!Object.hasOwn(entities, owner))
      throw new Error(`Entity.relate: relations given for "${owner}", which is not being related`)

  const related: Record<string, AnyEntity> = {}
  // Every relation is checked before any is added, so a refused call adds none.
  const additions: Array<readonly [AnyEntity, Readonly<Record<string, EntityMember>>]> = []
  for (const [ownerKey, entity] of Object.entries(entities)) {
    const specs = own(given, ownerKey) ?? {}
    assertFree(entity, Object.keys(specs), 'relation')
    const added = mapValues<RelationSpec<AnyEntity, Cardinality, boolean>, EntityMember>(
      specs,
      (spec, key) => {
        const targetKey = isEntity(spec.target)
          ? keyByToken.get(spec.target.identity.token)
          : undefined
        if (targetKey === undefined)
          throw new Error(
            `Entity "${entity.name}": relation "${key}" targets an Entity that is not being related`,
          )
        return Object.freeze({
          _tag: 'Relation',
          owner: entity.identity,
          key,
          // Read on call: the target may come later in `entities` than its owner.
          target: () => related[targetKey]!,
          cardinality: spec.cardinality,
          optional: spec.optional,
          metadata: Metadata.empty,
        })
      },
    )
    additions.push([entity, added])
    put(related, ownerKey, entity)
  }
  for (const [entity, added] of additions) extend(entity, { relations: added })
  return Object.freeze(related) as never
}

/**
 * Selects members of an Entity and assembles the schema of the result. A
 * relation selected with `true` yields an `EntityRef`; with a Selection of its
 * target, that Selection's value. `many` yields an array, an optional `one`
 * is nullable.
 */
export const select = <E extends AnyEntity, const Spec>(
  entity: E,
  spec: Spec & SelectionSpec<E, Spec>,
): Selection<E['name'], Spec, SelectionSchema<E, Spec>, IdOf<E>> => {
  const members: Readonly<Record<string, EntityMember>> = entity.members
  const fields = mapValues<unknown, Schema.Constraint>(spec, (selected, key) => {
    const member = own(members, key)
    if (member === undefined)
      throw new Error(`Entity "${entity.name}": cannot select "${key}", it is not a member`)
    if (member._tag !== 'Relation') {
      if (selected !== true)
        throw new Error(
          `Entity "${entity.name}": "${key}" is a ${kindName[member._tag]}, select it with true`,
        )
      return member.schema
    }
    const target = member.target()
    if (isSelectionPage(selected)) {
      if (member.cardinality !== 'many')
        throw new Error(
          `Entity "${entity.name}": "${key}" is one ${target.name}, so it has no pages`,
        )
      if (!isSameEntity(selected.selection.entity, target))
        throw new Error(`Entity "${entity.name}": "${key}" pages a Selection of ${target.name}`)
      return Schema.Struct({
        items: Schema.Array(selected.selection.schema as Schema.Top),
        hasNext: Schema.Boolean,
        hasPrevious: Schema.Boolean,
      })
    }
    let item: Schema.Top
    if (selected === true)
      item = Schema.Struct({ entity: Schema.Literal(target.name), id: idSchemaOf(target) })
    else if (isSelection(selected) && isSameEntity(selected.entity, target)) item = selected.schema
    else
      throw new Error(
        `Entity "${entity.name}": "${key}" takes true or a Selection of ${target.name}`,
      )
    return member.cardinality === 'many'
      ? Schema.Array(item)
      : member.optional
        ? Schema.NullOr(item)
        : item
  })
  return Object.freeze({
    [SelectionTypeId]: SelectionTypeId,
    entity,
    members: spec,
    schema: selectionSchema(entity, fields),
  }) as never
}

/**
 * A `many` relation read a page at a time, in place of its Selection:
 * `comments: Entity.page(CommentSummary, { first: 10 })`. The value is a page
 * of the Selection's values: `items`, `hasNext`, `hasPrevious`. Reading on from a cursor is another window.
 */
export const page = <Name extends string, S extends Schema.Constraint>(
  selection: Selection<Name, any, S>,
  window: PageWindow,
): SelectionPage<Name, S> => {
  const sides = [window.first, window.last].filter(size => size !== undefined)
  if (sides.length !== 1 || !sides.every(size => Number.isInteger(size) && size >= 0))
    throw new Error(
      `Entity.page: a window of ${selection.entity.name} takes first or last, a non-negative integer`,
    )
  if (
    (window.first !== undefined && window.before !== undefined) ||
    (window.last !== undefined && window.after !== undefined)
  )
    throw new Error(
      `Entity.page: a window of ${selection.entity.name} reads first after a cursor, or last before one`,
    )
  const page: SelectionPage<Name, S> = {
    [SelectionPageTypeId]: SelectionPageTypeId,
    selection,
    window,
  }
  return Object.freeze(page)
}

/**
 * Adds readable members that are not part of `entity.schema`. A
 * `Derived.count` or `Derived.exists` must read rows pointing at this
 * Entity: one over a relation to another is refused here, as is an exists
 * whose viewer is not another `one` relation of the same pointing Entity.
 */
export const derived =
  <const New extends DerivedSpecs>(specs: New) =>
  <E extends AnyEntity>(entity: E & Free<E, New> & PointsHere<E, New>): WithDerived<E, New> => {
    const members: Readonly<Record<string, EntityMember>> = entity.members
    // The very spec added again (`Guards.may` on a second view of the Entity) is the member it added.
    const fresh: DerivedSpecs = Object.fromEntries(
      Object.entries(specs).filter(([key, spec]) => {
        const taken = own(members, key)
        return !(
          taken?._tag === 'Derived' &&
          taken.schema === spec.schema &&
          taken.derives === spec.derives
        )
      }),
    )
    assertFree(entity, Object.keys(fresh), 'derived member')
    const added = mapValues<DerivedSpec<Schema.Constraint>, EntityMember>(fresh, (spec, key) => {
      const pointingHere = (relation: OneRelation, verb: string): void => {
        if (relation.cardinality !== 'one')
          fail(
            entity,
            `"${key}" ${verb} "${relation.key}", a many relation; name a one relation that points here`,
          )
        if (!isSameEntity(relation.target(), entity))
          fail(
            entity,
            `"${key}" ${verb} "${relation.owner.name}.${relation.key}", which points at ${relation.target().name}`,
          )
      }
      Derivation.$match(spec.derives, {
        Supplied: () => undefined,
        Count: ({ relation }) => pointingHere(relation, 'counts'),
        Exists: ({ relation, viewer }) => {
          pointingHere(relation, 'reads')
          if (viewer.owner.token !== relation.owner.token || viewer.key === relation.key)
            fail(
              entity,
              `"${key}"'s viewer "${viewer.owner.name}.${viewer.key}" must be another one relation of ${relation.owner.name}`,
            )
        },
      })
      return Object.freeze({
        _tag: 'Derived',
        owner: entity.identity,
        key,
        schema: spec.schema,
        derives: spec.derives,
        metadata: Metadata.empty,
      })
    })
    extend(entity, { derived: added })
    return entity as never
  }

/**
 * Says which members take their value from the write's context, never its
 * input: `Expr.viewer(User)`, whoever asks (a `one` relation to a User, or a
 * field holding their id), and `Expr.now`, when (a field stored as a
 * number). `on` says which writes set them: `'create'`, every insert, or
 * `'write'`, every insert and every update.
 *
 * ```ts
 * const Post = Blog.Post.pipe(
 *   Entity.sets({ author: Expr.viewer(User), createdAt: Expr.now }, { on: 'create' }),
 *   Entity.sets({ editedAt: Expr.now }, { on: 'write' }),
 * )
 * ```
 *
 * Every write of the Entity follows from it: a server writes the values and
 * a client predicts them, and a write whose input sets one is refused where
 * it is declared. Refused here: the id, a member set already, a `many`
 * relation, a relation set to anything but the viewer of its target, and a
 * field that cannot hold its value. Added after `Entity.relate` to set a
 * relation.
 */
export const sets =
  <E extends AnyEntity>(values: EntitySets<E>, options: { readonly on: SetOn }) =>
  (entity: E): E => {
    const given: Readonly<Record<string, unknown>> = values
    const added: Record<string, EntitySet> = {}
    for (const [key, value] of Object.entries(given)) {
      if (value === undefined) continue
      put(added, key, checkedSet(entity, key, value, options.on))
    }
    extend(entity, { sets: added })
    return entity
  }

/** Attaches an interpreter's metadata to the Entity itself. */
export const annotate =
  (metadata: Metadata) =>
  <E extends AnyEntity>(entity: E): E =>
    remake(entity, { metadata: Metadata.combine([entity.metadata, metadata]) }) as E

/** Attaches an interpreter's metadata to members, by key. */
export const annotateMembers =
  <E extends AnyEntity>(metadata: { readonly [K in keyof E['members']]?: Metadata }) =>
  (entity: E): E => {
    const given = metadata as Readonly<Record<string, Metadata | undefined>>
    for (const key of Object.keys(given))
      if (kindOf(entity, key) === undefined)
        throw new Error(`Entity "${entity.name}": cannot annotate "${key}", it is not a member`)
    const parts = partsOf.get(entity)!
    const fields = mapValues(entity.fields, (member: EntityMember, key) => {
      const extra = own(given, key)
      return extra === undefined
        ? member
        : Object.freeze({ ...member, metadata: Metadata.combine([member.metadata, extra]) })
    })
    // A relation or derived member is the Entity's own, so its metadata here is this descriptor's.
    const annotated: Record<string, Metadata> = { ...parts.annotated }
    for (const [key, extra] of Object.entries(given)) {
      if (extra === undefined || Object.hasOwn(entity.fields, key)) continue
      const earlier = own(parts.annotated, key)
      put(annotated, key, earlier === undefined ? extra : Metadata.combine([earlier, extra]))
    }
    return remake(entity, { fields, annotated }) as E
  }

/**
 * Reads an operation's input schema against an Entity. A key that names a
 * field maps to it; any other key is mapped explicitly, to a Field, to
 * `Relation.input(relation)`, or to `Entity.unmapped`. Nothing is inferred
 * from a naming convention such as `authorId`.
 */
export const input = <
  E extends AnyEntity,
  Fields extends Schema.Struct.Fields,
  // `{}` when every key maps itself, so the argument can be omitted.
  const Mapping = {},
>(
  entity: E,
  schema: Schema.Struct<Fields>,
  ...mapping: keyof InputMapping<E, Fields, Mapping> extends never
    ? [mapping?: Mapping & InputMapping<E, Fields, Mapping>]
    : [mapping: Mapping & InputMapping<E, Fields, Mapping>]
): EntityInput<E, Fields, InputMembers<E, Fields, Mapping>> => {
  const written: Readonly<Record<string, InputMember | string | undefined>> = mapping[0] ?? {}
  for (const key of Object.keys(written))
    if (!Object.hasOwn(schema.fields, key))
      throw new Error(`Entity "${entity.name}": "${key}" is mapped but is not a key of the input`)
  // A member named by its key: a Field as it is, a relation as its ids.
  const named = (key: string, name: string): InputMember => {
    const member = (entity.members as Readonly<Record<string, EntityMember | undefined>>)[name]
    switch (member?._tag) {
      case 'Field':
        return member
      case 'Relation':
        return Object.freeze({ _tag: 'RelationInput', relation: member })
      case 'Derived':
      case undefined:
        return fail(
          entity,
          `input key "${key}" is mapped to "${name}", which names no field or relation`,
        )
    }
  }
  const given: Readonly<Record<string, InputMember | undefined>> = mapValues(
    written,
    (member, key) => (typeof member === 'string' ? named(key, member) : member),
  )
  const fields: Readonly<Record<string, InputMember | undefined>> = entity.fields
  const members = mapValues(schema.fields, (_, key) => {
    const member =
      own(given, key) ??
      own(fields, key) ??
      fail(entity, `input key "${key}" names no field; map it to a member or Entity.unmapped`)
    const owned =
      member._tag === 'Field'
        ? member
        : member._tag === 'RelationInput' || member._tag === 'NestedInput'
          ? member.relation
          : member._tag === 'Unmapped'
            ? undefined
            : fail(
                entity,
                `input key "${key}" maps to a Field, Relation.input(relation), Relation.nested(relation, input), or Entity.unmapped`,
              )
    if (owned !== undefined && owned.owner.token !== entity.identity.token)
      fail(entity, `input key "${key}" is mapped to a member of "${owned.owner.name}"`)
    if (
      member._tag === 'NestedInput' &&
      !isSameEntity(member.input.entity, member.relation.target())
    )
      fail(
        entity,
        `input key "${key}" nests an input of "${member.input.entity.name}", but "${member.relation.key}" is of "${member.relation.target().name}"`,
      )
    return member
  })
  return Object.freeze({ entity, schema, members: Object.freeze(members) }) as never
}

/**
 * The schemas of some of an Entity's fields, by key, to spread into an input's
 * struct: `Schema.Struct({ ...Entity.fields(Post, 'id', 'title'), editorId: ... })`.
 * The input then keeps the field's own rules, and its keys map themselves.
 */
export const fields = <
  E extends AnyEntity,
  const Keys extends ReadonlyArray<keyof E['fields'] & string>,
>(
  entity: E,
  ...keys: Keys
): { readonly [K in Keys[number]]: E['fields'][K]['schema'] } =>
  Object.fromEntries(
    keys.map(key => [
      key,
      (
        own(
          entity.fields as Readonly<Record<string, EntityField<string, string, Schema.Constraint>>>,
          key,
        ) ?? fail(entity, `"${key}" is not a field`)
      ).schema,
    ]),
  ) as never

/**
 * The Selection of every member an input writes, with each relation as refs:
 * what an edit screen loads before it shows the input's current values.
 * `also` names members to read beside them, each with `true` (what a lock
 * reads). The Selection is typed as the input's alone: what it reads has
 * those members, and these besides.
 */
export const selectFor = <E extends AnyEntity, Fields extends Schema.Struct.Fields, Members>(
  input: EntityInput<E, Fields, Members>,
  options: { readonly also?: Readonly<Record<string, true>> | undefined } = {},
): Selection<
  E['name'],
  WrittenSpec<Members>,
  SelectionSchema<E, WrittenSpec<Members>>,
  IdOf<E>
> => {
  const members: Readonly<Record<string, InputMember>> = input.members as never
  const spec = Object.fromEntries(
    Object.values(members).flatMap((member): ReadonlyArray<readonly [string, unknown]> =>
      member._tag === 'Field'
        ? [[member.key, true]]
        : member._tag === 'RelationInput'
          ? [[member.relation.key, true]]
          : member._tag === 'NestedInput'
            ? // What the nested input writes of the target, so its keys can be shown too.
              [[member.relation.key, selectFor(member.input)]]
            : [],
    ),
  )
  return select(input.entity, { ...spec, ...options.also } as never) as never
}

/**
 * The input values that reproduce `value`, a value read through `selectFor`
 * (or any Selection with those members): a field as it is, a relation as the
 * id or ids of its refs. A key whose member `value` lacks is left out, as is
 * an unmapped key, which the Entity knows nothing about.
 */
export const valuesFor = <E extends AnyEntity, Fields extends Schema.Struct.Fields, Members>(
  input: EntityInput<E, Fields, Members>,
  value: Readonly<Record<string, unknown>>,
): Partial<Schema.Struct.Type<Fields>> => {
  const members: Readonly<Record<string, InputMember>> = input.members as never
  // The id of a ref or of a nested Selection's value; `undefined` when it has none.
  const idOf = (held: unknown): unknown =>
    held === null
      ? null
      : typeof held === 'object' && 'id' in held
        ? held.id
        : typeof held === 'string'
          ? held
          : undefined
  const entries = Object.entries(members).flatMap(([key, member]) => {
    if (member._tag === 'Unmapped') return []
    const written = member._tag === 'Field' ? member.key : member.relation.key
    if (!(written in value)) return []
    const read = value[written]
    switch (member._tag) {
      case 'Field':
        return [[key, read] as const]
      case 'NestedInput': {
        const nested = (held: unknown): unknown =>
          typeof held === 'object' && held !== null
            ? valuesFor(member.input, held as Readonly<Record<string, unknown>>)
            : null
        return [[key, Array.isArray(read) ? read.map(nested) : nested(read)] as const]
      }
      case 'RelationInput': {
        const ids = Array.isArray(read) ? read.map(idOf) : idOf(read)
        // A relation read without its ids (a nested Selection that left `id` out) fills nothing.
        const known = Array.isArray(ids) ? !ids.includes(undefined) : ids !== undefined
        return known ? [[key, ids] as const] : []
      }
    }
  })
  return Object.fromEntries(entries) as Partial<Schema.Struct.Type<Fields>>
}

export { isEntity as is, isSameEntity as same }
export {
  check,
  invariant,
  invariantsOf as invariants,
  judge,
  judgeAgainst,
  judgeInput,
  readsBefore,
} from './invariant.js'
