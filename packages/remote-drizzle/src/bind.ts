/**
 * Binding `foldkit-entity` Entities to Drizzle tables.
 *
 * The Entity already says what a relation is (one Author, many Comments);
 * `bind` only says how the database stores it. The result is the same
 * `EntityBinding` that `entity(name, table, …)` makes, so `source` and `query`
 * take it unchanged.
 */
import type { AnyColumn, SQL, Table as DrizzleTable } from 'drizzle-orm'
import { getTableColumns } from 'drizzle-orm'
import { holdsChecks } from './checks.js'
import { contextSharers } from './columns.js'
import { operatorsFrom, type BindingOperators } from './operators.js'
import { Option, Schema, SchemaAST } from 'effect'
import { SchemaShape } from 'foldkit-entity'
import * as Domain from 'foldkit-entity'
import { Entity, type FieldsFrom } from 'foldkit-remote'
import type {
  AnyEntityBinding,
  ComputedConfig,
  EntityBinding,
  ManyRelation,
  RelationBinding,
  Visible,
} from './binding.js'
import type { OrderTerm } from './cursor.js'

/** A `one` relation: the foreign key is a column of the owner's table. */
export interface OneStorage {
  readonly field: AnyColumn
}

/**
 * A `one` relation from the other side: the foreign key is a column of the
 * target's table, as a user's profile points at its user. One-to-one only holds
 * if that column is unique, so `bind` requires it to be, and requires the
 * relation to be `{ optional: true }`, because no row may point back.
 */
export interface InverseOneStorage {
  readonly foreignKey: AnyColumn
  /** The owner column the foreign key references; defaults to the owner's `id`. */
  readonly localKey?: AnyColumn | undefined
  /** Appended to the target query, e.g. to exclude soft-deleted rows. */
  readonly where?: SQL | undefined
  /**
   * The column is unique through a constraint Drizzle does not put on the column
   * (a unique index declared on the table): vouch for it.
   */
  readonly assumeUnique?: true | undefined
}

interface ManyOptions {
  /** Natural order of the loaded refs; defaults to the target id. */
  readonly orderBy?: readonly OrderTerm[] | undefined
  /** Appended to the child query, e.g. to exclude soft-deleted rows. */
  readonly where?: SQL | undefined
}

/** A `many` relation whose foreign key is a column of the target's table. */
export interface ManyStorage extends ManyOptions {
  readonly foreignKey: AnyColumn
  /** The owner column the foreign key references; defaults to the owner's `id`. */
  readonly localKey?: AnyColumn | undefined
}

/** A `many` relation joined through a table: `localColumn` references the owner's `id`. */
export interface ThroughStorage extends ManyOptions {
  readonly through: DrizzleTable
  readonly localColumn: AnyColumn
  readonly foreignColumn: AnyColumn
}

type RelationStorage<Relation> =
  Relation extends Domain.EntityRelation<any, any, any, infer Cardinality, infer Optional>
    ? Cardinality extends 'one'
      ? // Read from the target's table, no row may point back: only an optional `one` can be.
        Optional extends true
        ? OneStorage | InverseOneStorage
        : OneStorage
      : ManyStorage | ThroughStorage
    : never

type OneDomainRelation = Domain.EntityRelation<string, string, Domain.AnyEntity, 'one', boolean>

type ManyKeys<E extends Domain.AnyEntity> = {
  [K in keyof E['relations']]: E['relations'][K] extends Domain.EntityRelation<
    any,
    any,
    any,
    'many',
    any
  >
    ? K
    : never
}[keyof E['relations']]

/**
 * A derived member this package does not compute: the application supplies it,
 * by wrapping the source and answering for the field itself. `bind` registers
 * the member and reads nothing for it.
 */
export interface SuppliedDerived {
  readonly supplied: true
}

/**
 * A `Derived.make` member counted over a `many` relation of its owner: what a
 * join table with no Entity is counted by. A count the Entity can say
 * (`Derived.count`) takes no entry.
 */
export interface CountDerived<Relation extends PropertyKey = string> {
  readonly relation: Relation
  /** An optional filter on the counted rows. */
  readonly where?: SQL | undefined
}

/** The derived members an interpreter supplies (`Derived.make`): only these take storage. */
type SuppliedKeys<E extends Domain.AnyEntity> = {
  [K in keyof E['derived']]: E['derived'][K] extends Domain.EntityDerived<any, any, any, infer D>
    ? D extends { readonly _tag: 'Supplied' }
      ? K
      : never
    : never
}[keyof E['derived']]

/** `relations` and `derived` are required exactly when the Entity has some. */
type Required_<Key extends string, Members, Value> = keyof Members extends never
  ? { readonly [K in Key]?: undefined }
  : { readonly [K in Key]: Value }

export type EntityStorage<E extends Domain.AnyEntity> = {
  readonly table: DrizzleTable
  /** A column for a field whose name differs from the column's; the rest match by name. */
  readonly fields?: { readonly [K in keyof E['fields']]?: AnyColumn } | undefined
  /** Which rows a principal may see at all; every read of the table applies it. */
  readonly visible?: Visible | undefined
} & Required_<
  'relations',
  E['relations'],
  { readonly [K in keyof E['relations']]: RelationStorage<E['relations'][K]> }
> &
  Required_<
    'derived',
    Pick<E['derived'], SuppliedKeys<E>>,
    { readonly [K in SuppliedKeys<E>]: CountDerived<ManyKeys<E>> | SuppliedDerived }
  >

type Storage<Es extends Domain.Entities> = { readonly [K in keyof Es]: EntityStorage<Es[K]> }

type AnyStorage = Partial<OneStorage & ManyStorage & ThroughStorage & InverseOneStorage>

/** `EntityStorage` as the implementation reads it, once the types have checked it against the Entity. */
interface LooseStorage {
  readonly table: DrizzleTable
  readonly fields?: Readonly<Record<string, AnyColumn | undefined>> | undefined
  readonly relations?: Readonly<Record<string, AnyStorage>> | undefined
  readonly derived?: Readonly<Record<string, CountDerived | SuppliedDerived>> | undefined
  readonly visible?: Visible | undefined
}

const fail = (message: string): never => {
  throw new Error(`[foldkit-remote-drizzle] ${message}`)
}

type PlainKind = 'string' | 'number' | 'boolean'

const kindOfAst = (ast: SchemaAST.AST): PlainKind | undefined => {
  const kinds = new Set(
    SchemaShape.present(ast).map((member): PlainKind | undefined =>
      SchemaAST.isString(member)
        ? 'string'
        : SchemaAST.isNumber(member)
          ? 'number'
          : SchemaAST.isBoolean(member)
            ? 'boolean'
            : SchemaAST.isLiteral(member) &&
                (typeof member.literal === 'string' ||
                  typeof member.literal === 'number' ||
                  typeof member.literal === 'boolean')
              ? (typeof member.literal as PlainKind)
              : undefined,
    ),
  )
  const [only] = kinds
  return kinds.size === 1 ? only : undefined
}

/**
 * What a field plainly holds, `null` and `undefined` set aside: text, a number,
 * or a flag, the same decoded as on the wire. Anything else (a transformation, a
 * struct, a mixed union) is `undefined`, and is not checked.
 */
const plainKind = (schema: Schema.Top): PlainKind | undefined => {
  const decoded = kindOfAst(Schema.toType(schema).ast)
  const encoded = kindOfAst(Schema.toEncoded(schema).ast)
  return decoded === encoded ? decoded : undefined
}

/**
 * Refuses a column that cannot hold the field: text under a number, a nullable
 * column under a field that admits nothing. Only what both sides state plainly
 * is compared, so a custom column or a transforming schema passes unchecked.
 */
const checkColumn = (name: string, field: string, schema: Schema.Top, column: AnyColumn): void => {
  const holds = plainKind(schema)
  // Drizzle may qualify the kind (`number int53`, `string uuid`); the kind comes first.
  const [stored = ''] = (column.dataType as string).split(' ')
  if (holds !== undefined && ['string', 'number', 'boolean'].includes(stored) && stored !== holds)
    fail(
      `field "${field}" on entity "${name}" is a ${holds}, but column "${column.name}" holds a ${stored}`,
    )
  // The column holds the encoded value: an `Option` field stores its none as a null.
  const admits = Schema.is(Schema.toEncoded(schema) as Schema.Codec<unknown>)
  if (column.notNull === false && !admits(null) && !admits(undefined))
    fail(
      `field "${field}" on entity "${name}" sits on nullable column "${column.name}"; let its schema admit null, or make the column not null`,
    )
}

/** A `one` stored on the target's table: a `many` that is known to hold at most one. */
const inverseOne = (
  stored: AnyStorage,
  relation: Domain.EntityMember & { readonly _tag: 'Relation' },
  name: string,
  field: string,
  ownerId: AnyColumn | undefined,
) => {
  const foreignKey = stored.foreignKey!
  if (!relation.optional)
    fail(
      `relation "${field}" on entity "${name}" is one: give its "field", or declare it { optional: true } to read it from the target's table, where no row may point back`,
    )
  if (foreignKey.isUnique !== true && foreignKey.primary !== true && stored.assumeUnique !== true)
    fail(
      `relation "${field}" on entity "${name}" is one, but column "${foreignKey.name}" is not unique, so many rows may point back; make it unique, or vouch with assumeUnique`,
    )
  return {
    kind: 'many',
    single: true,
    foreignKey,
    localKey: stored.localKey ?? ownerId,
    ...(stored.where === undefined ? {} : { where: stored.where }),
  }
}

const oneColumn = (
  stored: AnyStorage,
  relation: Domain.EntityMember & { readonly _tag: 'Relation' },
  name: string,
  field: string,
): AnyColumn => {
  const column =
    stored.field ?? fail(`relation "${field}" on entity "${name}" is one: give its "field"`)
  // A null foreign key has no ref, so the Entity must admit null.
  if (column.notNull === false && !relation.optional)
    fail(
      `relation "${field}" on entity "${name}" points at a nullable column; declare it { optional: true }`,
    )
  return column
}

/**
 * Binds every Entity of an `Entity.relate` result to its table in one step, so
 * a relation's target binding can be one that is declared after its owner.
 */
export const bind = <const Es extends Domain.Entities, const S extends Storage<Es>>(
  entities: Es,
  storage: S & Storage<Es>,
  options: {
    /**
     * How every binding's expressions run primitive operators, in SQL and in
     * memory; each kernel's when not given. One table for the whole domain, so
     * a query, a rule and an invariant over one operator run it alike.
     */
    readonly operators?: Partial<BindingOperators> | undefined
  } = {},
): {
  readonly [K in keyof Es]: EntityBinding<
    Es[K]['name'],
    S[K]['table'],
    FieldsFrom<Es[K]>,
    Record<keyof Es[K]['relations'] & string, RelationBinding>
  >
} => {
  const bindings: Record<string, EntityBinding<string, DrizzleTable>> = {}
  const operators = operatorsFrom(options.operators)
  const tables = storage as unknown as Readonly<Record<string, LooseStorage | undefined>>
  const keyOf = (target: Domain.AnyEntity, owner: string, relation: string): string =>
    Object.keys(entities).find(key => target.identity.token === entities[key]!.identity.token) ??
    fail(`relation "${relation}" on entity "${owner}" targets an Entity that is not being bound`)
  // Read on use, as a relation's target is: a path may reach a binding made after its own.
  const reach = (owner: Domain.EntityIdentity<string>): Option.Option<AnyEntityBinding> =>
    Option.flatMap(
      Option.fromUndefinedOr(
        Object.keys(entities).find(key => entities[key]!.identity.token === owner.token),
      ),
      key => Option.fromUndefinedOr(bindings[key]),
    )

  /**
   * A `Derived.count`'s or `Derived.exists`'s rows: the pointing Entity's
   * table, grouped by the column its `one` relation is stored on, which
   * references the counted id.
   */
  const pointing = (
    relation: OneDomainRelation,
    owner: string,
    field: string,
    ownerId: AnyColumn | undefined,
  ): ComputedConfig => {
    const counted = `${relation.owner.name}.${relation.key}`
    const pointingKey = pointingKeyOf(relation, owner, field)
    const foreignKey = storedOn(pointingKey, relation, owner, field)
    const over = Object.defineProperty(
      {
        kind: 'many',
        foreignKey,
        localKey: ownerId ?? fail(`entity "${owner}" has no id column to count ${counted} by`),
      },
      'entity',
      // Read on use: the pointing Entity may be bound after this one.
      { get: () => bindings[pointingKey], enumerable: true },
    ) as ManyRelation<AnyEntityBinding>
    return { relation: counted, over }
  }

  const pointingKeyOf = (relation: OneDomainRelation, owner: string, field: string): string =>
    Object.keys(entities).find(key => entities[key]!.identity.token === relation.owner.token) ??
    fail(
      `derived "${field}" on entity "${owner}" reads ${relation.owner.name}.${relation.key}, but ${relation.owner.name} is not being bound`,
    )

  /** The column a `one` relation of the pointing Entity is stored on, its own table's. */
  const storedOn = (
    pointingKey: string,
    relation: OneDomainRelation,
    owner: string,
    field: string,
  ): AnyColumn =>
    tables[pointingKey]?.relations?.[relation.key]?.field ??
    fail(
      `derived "${field}" on entity "${owner}" reads ${relation.owner.name}.${relation.key}, which must be stored on ${relation.owner.name}'s own table ({ field })`,
    )

  for (const [key, entity] of Object.entries(entities)) {
    const name = entity.name
    const descriptor = Entity.from(entity as never)
    const config = tables[key] ?? fail(`entity "${name}" has no table`)
    const tableColumns = getTableColumns(config.table)
    const overrides = config.fields ?? {}
    // Field names arrive from the client, so the lookup maps have no prototype.
    const columns = Object.create(null) as Record<string, AnyColumn>
    for (const field of Object.keys(entity.fields))
      columns[field] =
        overrides[field] ??
        tableColumns[field] ??
        fail(`field "${field}" on entity "${name}" has no column; name one under "fields"`)
    for (const [field, member] of Object.entries(
      entity.fields as Readonly<Record<string, Domain.EntityMember>>,
    ))
      if (member._tag === 'Field')
        checkColumn(name, field, member.schema as Schema.Top, columns[field]!)
    holdsChecks(entity, config.table, columns, operators)

    const relations = Object.create(null) as Record<string, RelationBinding>
    const members: Readonly<Record<string, Domain.EntityMember>> = entity.relations
    const given = config.relations ?? {}
    for (const [field, relation] of Object.entries(members)) {
      if (relation._tag !== 'Relation') continue
      const stored = given[field] ?? fail(`relation "${field}" on entity "${name}" has no storage`)
      const targetKey = keyOf(relation.target(), name, field)
      const many = {
        ...(stored.orderBy === undefined ? {} : { orderBy: stored.orderBy }),
        ...(stored.where === undefined ? {} : { where: stored.where }),
      }
      const shape =
        relation.cardinality === 'one' &&
        stored.field === undefined &&
        stored.foreignKey !== undefined
          ? inverseOne(stored, relation, name, field, columns.id)
          : relation.cardinality === 'one'
            ? {
                kind: 'one',
                field: oneColumn(stored, relation, name, field),
                nullable: relation.optional,
              }
            : stored.through !== undefined
              ? {
                  kind: 'manyToMany',
                  through: stored.through,
                  localColumn:
                    stored.localColumn ??
                    fail(
                      `relation "${field}" on entity "${name}" goes through a table: give "localColumn"`,
                    ),
                  foreignColumn:
                    stored.foreignColumn ??
                    fail(
                      `relation "${field}" on entity "${name}" goes through a table: give "foreignColumn"`,
                    ),
                  ...many,
                }
              : {
                  kind: 'many',
                  foreignKey:
                    stored.foreignKey ??
                    fail(
                      `relation "${field}" on entity "${name}" is many: give "foreignKey" or "through"`,
                    ),
                  localKey: stored.localKey ?? columns.id,
                  ...many,
                }
      // Read on use: the target may be bound after its owner.
      relations[field] = Object.defineProperty(shape, 'entity', {
        get: () => bindings[targetKey],
        enumerable: true,
      }) as RelationBinding
    }

    for (const { set, member, column } of contextSharers(entity.sets, columns, relations))
      fail(
        `entity "${name}" sets "${set}" from the write's context but not "${member}", both stored on column "${column}": a write of "${member}" would overwrite it; set both or neither`,
      )

    const computed = Object.create(null) as Record<string, ComputedConfig>
    const counts = config.derived ?? {}
    const derivedMembers: Readonly<
      Record<string, Domain.EntityDerived<string, string, Schema.Constraint>>
    > = entity.derived
    for (const [field, member] of Object.entries(derivedMembers)) {
      const held = Domain.Derivation.$match(member.derives, {
        Count: ({ relation }): Option.Option<ComputedConfig> => {
          if (Object.hasOwn(counts, field))
            fail(
              `derived "${field}" on entity "${name}" is a Derived.count, which bind compiles; give it no entry`,
            )
          return Option.some(pointing(relation, name, field, columns.id))
        },
        Exists: ({ relation, viewer }): Option.Option<ComputedConfig> => {
          if (Object.hasOwn(counts, field))
            fail(
              `derived "${field}" on entity "${name}" is a Derived.exists, which bind compiles; give it no entry`,
            )
          return Option.some({
            ...pointing(relation, name, field, columns.id),
            viewer: {
              column: storedOn(pointingKeyOf(viewer, name, field), viewer, name, field),
              entity: viewer.target().name,
            },
          })
        },
        Supplied: (): Option.Option<ComputedConfig> => {
          const stored =
            counts[field] ?? fail(`derived "${field}" on entity "${name}" has no storage`)
          // Supplied by the application's own source: nothing to compile.
          if ('supplied' in stored) return Option.none()
          const counted = relations[stored.relation]
          if (
            counted === undefined ||
            counted.kind === 'one' ||
            (counted.kind === 'many' && counted.single === true)
          )
            fail(
              `derived "${field}" on entity "${name}" needs a many relation, not "${stored.relation}"`,
            )
          // A count is a number, so that is what the Entity must have declared.
          if (!Schema.is(Schema.toType(member.schema as Schema.Top))(0))
            fail(
              `derived "${field}" on entity "${name}" is stored as a count, but its schema is not a number`,
            )
          return Option.some(stored)
        },
      })
      if (Option.isSome(held)) computed[field] = held.value
    }

    bindings[key] = {
      ...descriptor,
      table: config.table,
      columns,
      relations,
      computed,
      invariants: Domain.Entity.invariants(entity),
      operators,
      reach,
      ...(config.visible === undefined ? {} : { visible: config.visible }),
    } as unknown as EntityBinding<string, DrizzleTable>
  }
  return bindings as never
}
