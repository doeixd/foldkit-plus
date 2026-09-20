/**
 * `foldkit-entity` — domain structure as typed values.
 *
 * An Entity names its intrinsic Fields (one `Schema.Struct`), its Relations
 * (navigation edges to other Entities, declared with `Entity.relate`), and its Derived members (readable
 * values an interpreter supplies). It describes; it fetches, stores, and
 * renders nothing. Remote, Drizzle, and form packages interpret it and attach
 * what they need as `foldkit-metadata`.
 */
import { Pipeable, Schema } from 'effect'
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

type WithDerived<E, New extends DerivedSpecs> =
  E extends Entity<infer Name, infer Fields, infer R, infer D>
    ? Entity<Name, Fields, R, D & New>
    : never

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
  Es[K] extends Entity<infer Name, infer Fields, infer R, infer D>
    ? Entity<Name, Fields, R & RelatedSpecs<Es, Rs, K>, D>
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

export const SelectionTypeId: unique symbol = Symbol.for('foldkit-entity/Selection')
export type SelectionTypeId = typeof SelectionTypeId

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

type RefSchema<Target extends AnyEntity> = Schema.Struct<{
  readonly entity: Schema.Literal<Target['name']>
  readonly id: IdSchemaOf<Target>
}>

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

type AnySelection<Name extends string = string> = Selection<Name, any, any>

/** `true` for any member; a relation also takes a Selection of its target. */
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

export const SelectionPageTypeId: unique symbol = Symbol.for('foldkit-entity/SelectionPage')
export type SelectionPageTypeId = typeof SelectionPageTypeId

/** A Selection of a `many` relation's target, read a page at a time. */
export interface SelectionPage<Name extends string, S extends Schema.Constraint> {
  readonly [SelectionPageTypeId]: SelectionPageTypeId
  readonly selection: Selection<Name, any, S>
  readonly window: PageWindow
}

type PageSchema<S extends Schema.Constraint> = Schema.Struct<{
  readonly items: Schema.$Array<S>
  readonly hasNext: Schema.Boolean
  readonly hasPrevious: Schema.Boolean
}>

type SelectionSpec<E extends AnyEntity, Spec> = {
  readonly [K in keyof Spec]: K extends keyof E['relations']
    ? E['relations'][K] extends EntityRelation<any, any, infer Target, infer C, any>
      ? | true
        | AnySelection<Target['name']>
        // Only a `many` relation has pages.
        | (C extends 'many' ? SelectionPage<Target['name'], any> : never)
      : never
    : K extends keyof E['members']
      ? true
      : `"${K & string}" is not a member of ${E['name']}`
}

type RelationShape<
  C extends Cardinality,
  Optional extends boolean,
  S extends Schema.Constraint,
> = C extends 'many' ? Schema.$Array<S> : Optional extends true ? Schema.NullOr<S> : S

type SelectedSchema<Member, Selected> = Member extends
  EntityField<any, any, infer S> | EntityDerived<any, any, infer S>
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

type SelectionSchema<E extends AnyEntity, Spec> = Schema.Struct<{
  readonly [K in keyof Spec & keyof E['members']]: SelectedSchema<E['members'][K], Spec[K]>
}>

interface AstLike {
  readonly _tag: string
  readonly literal?: unknown
  readonly types?: ReadonlyArray<AstLike>
}

const isText = (ast: AstLike): boolean =>
  ast._tag === 'String' ||
  ast._tag === 'TemplateLiteral' ||
  (ast._tag === 'Literal' && typeof ast.literal === 'string') ||
  (ast._tag === 'Union' && (ast.types ?? []).length > 0 && (ast.types ?? []).every(isText))

/** The `id` field's schema when it is text, so a ref's id keeps its brand and its checks; else text. */
const idSchemaOf = (entity: AnyEntity): Schema.Top => {
  const fields: Readonly<Record<string, EntityMember | undefined>> = entity.fields
  const id = fields.id
  if (id === undefined || id._tag !== 'Field') return Schema.String
  const type = Schema.toType(id.schema as Schema.Top)
  return isText(type.ast as unknown as AstLike) ? type : Schema.String
}

const isSelectionPage = (value: unknown): value is SelectionPage<string, Schema.Constraint> =>
  typeof value === 'object' && value !== null && SelectionPageTypeId in value

const isSelection = (value: unknown): value is AnySelection =>
  typeof value === 'object' && value !== null && SelectionTypeId in value

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

/**
 * Only the value that is present has to fit: an input may leave a key out (a
 * partial update) or send `null` to clear it. Whether it may is the input
 * schema's rule; the fit only guards against mapping the wrong member.
 */
type Present<T> = Exclude<T, null | undefined>

type MappingFor<Name extends string, Input, M> = M extends Unmapped
  ? M
  : M extends
        | EntityField<infer Owner, any, any>
        | RelationInput<EntityRelation<infer Owner, any, any, any, any>>
        | NestedInput<EntityRelation<infer Owner, any, any, any, any>, any>
    ? [Owner] extends [Name]
      ? M extends EntityField<any, any, infer S>
        ? Present<Input> extends Schema.Schema.Type<S>
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
    ? Present<Schema.Schema.Type<Fields[K]>> extends Schema.Schema.Type<E['fields'][K]['schema']>
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

type InputMembers<E extends AnyEntity, Fields extends Schema.Struct.Fields, Mapping> = {
  readonly [K in keyof Fields]: K extends keyof Mapping
    ? Named<E, Mapping[K]>
    : K extends keyof E['fields']
      ? E['fields'][K]
      : never
}

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

const unmapped: Unmapped = Object.freeze({ _tag: 'Unmapped' })

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

  /**
   * Declares the relations between a set of Entities in one step, and returns
   * them related. One step, because Entities that point at each other cannot
   * each be declared in terms of the other.
   */
  relate: <const Es extends Entities, const Rs extends RelationMap<Es>>(
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
      if (!(owner in entities))
        throw new Error(`Entity.relate: relations given for "${owner}", which is not being related`)

    const related: Record<string, AnyEntity> = {}
    for (const [ownerKey, entity] of Object.entries(entities)) {
      const specs = given[ownerKey] ?? {}
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
      related[ownerKey] = make({ ...entity, relations: { ...entity.relations, ...added } })
    }
    return Object.freeze(related) as never
  },

  /**
   * Selects members of an Entity and assembles the schema of the result. A
   * relation selected with `true` yields an `EntityRef`; with a Selection of its
   * target, that Selection's value. `many` yields an array, an optional `one`
   * is nullable.
   */
  select: <E extends AnyEntity, const Spec>(
    entity: E,
    spec: Spec & SelectionSpec<E, Spec>,
  ): Selection<E['name'], Spec, SelectionSchema<E, Spec>, IdOf<E>> => {
    const members: Readonly<Record<string, EntityMember>> = entity.members
    const fields = mapValues<unknown, Schema.Constraint>(spec, (selected, key) => {
      const member = members[key]
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
      else if (isSelection(selected) && isSameEntity(selected.entity, target))
        item = selected.schema
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
      schema: Schema.Struct(fields),
    }) as never
  },

  /**
   * A `many` relation read a page at a time, in place of its Selection:
   * `comments: Entity.page(CommentSummary, { first: 10 })`. The value is a page
   * of the Selection's values: `items`, `hasNext`, `hasPrevious`. Reading on from a cursor is another window.
   */
  page: <Name extends string, S extends Schema.Constraint>(
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

  /**
   * Reads an operation's input schema against an Entity. A key that names a
   * field maps to it; any other key is mapped explicitly, to a Field, to
   * `Relation.input(relation)`, or to `Entity.unmapped`. Nothing is inferred
   * from a naming convention such as `authorId`.
   */
  input: <
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
      if (!(key in schema.fields))
        throw new Error(`Entity "${entity.name}": "${key}" is mapped but is not a key of the input`)
    // A member named by its key: a Field as it is, a relation as its ids.
    const named = (key: string, name: string): InputMember => {
      const member = (entity.members as Readonly<Record<string, EntityMember | undefined>>)[name]
      if (member?._tag === 'Field') return member
      if (member?._tag === 'Relation')
        return Object.freeze({ _tag: 'RelationInput', relation: member })
      return fail(
        entity,
        `input key "${key}" is mapped to "${name}", which names no field or relation`,
      )
    }
    const given: Readonly<Record<string, InputMember | undefined>> = mapValues(
      written,
      (member, key) => (typeof member === 'string' ? named(key, member) : member),
    )
    const fields: Readonly<Record<string, InputMember | undefined>> = entity.fields
    const members = mapValues(schema.fields, (_, key) => {
      const member =
        given[key] ??
        fields[key] ??
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
  },

  /** For an input key that is about the operation rather than the Entity. */
  unmapped,

  /**
   * The schemas of some of an Entity's fields, by key, to spread into an input's
   * struct: `Schema.Struct({ ...Entity.fields(Post, 'id', 'title'), editorId: ... })`.
   * The input then keeps the field's own rules, and its keys map themselves.
   */
  fields: <E extends AnyEntity, const Keys extends ReadonlyArray<keyof E['fields'] & string>>(
    entity: E,
    ...keys: Keys
  ): { readonly [K in Keys[number]]: E['fields'][K]['schema'] } =>
    Object.fromEntries(
      keys.map(key => [
        key,
        (
          (
            entity.fields as Readonly<
              Record<string, EntityField<string, string, Schema.Constraint> | undefined>
            >
          )[key] ?? fail(entity, `"${key}" is not a field`)
        ).schema,
      ]),
    ) as never,

  /**
   * The Selection of every member an input writes, with each relation as refs:
   * what an edit screen loads before it shows the input's current values.
   */
  selectFor: <E extends AnyEntity, Fields extends Schema.Struct.Fields, Members>(
    input: EntityInput<E, Fields, Members>,
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
                [[member.relation.key, Entity.selectFor(member.input)]]
              : [],
      ),
    )
    return Entity.select(input.entity, spec as never) as never
  },

  /**
   * The input values that reproduce `value`, a value read through `selectFor`
   * (or any Selection with those members): a field as it is, a relation as the
   * id or ids of its refs. A key whose member `value` lacks is left out, as is
   * an unmapped key, which the Entity knows nothing about.
   */
  valuesFor: <E extends AnyEntity, Fields extends Schema.Struct.Fields, Members>(
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
      if (member._tag === 'Field') return [[key, read] as const]
      if (member._tag === 'NestedInput') {
        const nested = (held: unknown): unknown =>
          typeof held === 'object' && held !== null
            ? Entity.valuesFor(member.input, held as Readonly<Record<string, unknown>>)
            : null
        return [[key, Array.isArray(read) ? read.map(nested) : nested(read)] as const]
      }
      const ids = Array.isArray(read) ? read.map(idOf) : idOf(read)
      // A relation read without its ids (a nested Selection that left `id` out) fills nothing.
      const known = Array.isArray(ids) ? !ids.includes(undefined) : ids !== undefined
      return known ? [[key, ids] as const] : []
    })
    return Object.fromEntries(entries) as Partial<Schema.Struct.Type<Fields>>
  },

  is: isEntity,

  /** True when both descriptors are versions of one Entity. */
  same: isSameEntity,
}

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

export const Derived = {
  make: <S extends Schema.Constraint>(schema: S): DerivedSpec<S> => ({ schema }),
}
