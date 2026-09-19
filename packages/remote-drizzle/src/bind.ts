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
import { Schema } from 'effect'
import type * as Domain from 'foldkit-entity'
import { Entity, type FieldsFrom } from 'foldkit-remote'
import type { ComputedConfig, EntityBinding, RelationBinding } from './binding.js'
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

/** How a derived member is computed. A count of a `many` relation is the one kind so far. */
export interface CountDerived<Relation extends PropertyKey = string> {
  readonly relation: Relation
  /** An optional filter on the counted rows. */
  readonly where?: SQL | undefined
}

/** `relations` and `derived` are required exactly when the Entity has some. */
type Required_<Key extends string, Members, Value> = keyof Members extends never
  ? { readonly [K in Key]?: undefined }
  : { readonly [K in Key]: Value }

export type EntityStorage<E extends Domain.AnyEntity> = {
  readonly table: DrizzleTable
  /** A column for a field whose name differs from the column's; the rest match by name. */
  readonly fields?: { readonly [K in keyof E['fields']]?: AnyColumn } | undefined
} & Required_<
  'relations',
  E['relations'],
  { readonly [K in keyof E['relations']]: RelationStorage<E['relations'][K]> }
> &
  Required_<
    'derived',
    E['derived'],
    { readonly [K in keyof E['derived']]: CountDerived<ManyKeys<E>> }
  >

type Storage<Es extends Domain.Entities> = { readonly [K in keyof Es]: EntityStorage<Es[K]> }

type AnyStorage = Partial<OneStorage & ManyStorage & ThroughStorage & InverseOneStorage>

/** `EntityStorage` as the implementation reads it, once the types have checked it against the Entity. */
interface LooseStorage {
  readonly table: DrizzleTable
  readonly fields?: Readonly<Record<string, AnyColumn | undefined>> | undefined
  readonly relations?: Readonly<Record<string, AnyStorage>> | undefined
  readonly derived?: Readonly<Record<string, CountDerived>> | undefined
}

const fail = (message: string): never => {
  throw new Error(`[foldkit-remote-drizzle] ${message}`)
}

type PlainKind = 'string' | 'number' | 'boolean'

interface AstLike {
  readonly _tag: string
  readonly literal?: unknown
  readonly types?: ReadonlyArray<AstLike>
}

const kindOfAst = (ast: AstLike): PlainKind | undefined => {
  const members =
    ast._tag === 'Union'
      ? (ast.types ?? []).filter(member => member._tag !== 'Null' && member._tag !== 'Undefined')
      : [ast]
  const kinds = new Set(
    members.map((member): PlainKind | undefined =>
      member._tag === 'String'
        ? 'string'
        : member._tag === 'Number'
          ? 'number'
          : member._tag === 'Boolean'
            ? 'boolean'
            : member._tag === 'Literal' &&
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
  const decoded = kindOfAst(Schema.toType(schema).ast as unknown as AstLike)
  const encoded = kindOfAst(Schema.toEncoded(schema).ast as unknown as AstLike)
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
  const admits = Schema.is(Schema.toType(schema) as Schema.Codec<unknown>)
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
): {
  readonly [K in keyof Es]: EntityBinding<
    Es[K]['name'],
    S[K]['table'],
    FieldsFrom<Es[K]>,
    Record<keyof Es[K]['relations'] & string, RelationBinding>
  >
} => {
  const bindings: Record<string, EntityBinding<string, DrizzleTable>> = {}
  const tables = storage as unknown as Readonly<Record<string, LooseStorage | undefined>>
  const keyOf = (target: Domain.AnyEntity, owner: string, relation: string): string =>
    Object.keys(entities).find(key => target.identity.token === entities[key]!.identity.token) ??
    fail(`relation "${relation}" on entity "${owner}" targets an Entity that is not being bound`)

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

    const computed = Object.create(null) as Record<string, ComputedConfig>
    const counts = config.derived ?? {}
    for (const field of Object.keys(entity.derived)) {
      const count = counts[field] ?? fail(`derived "${field}" on entity "${name}" has no storage`)
      const counted = relations[count.relation]
      if (
        counted === undefined ||
        counted.kind === 'one' ||
        (counted.kind === 'many' && counted.single === true)
      )
        fail(
          `derived "${field}" on entity "${name}" needs a many relation, not "${count.relation}"`,
        )
      // A count is a number, so that is what the Entity must have declared.
      const declared = (entity.derived as Readonly<Record<string, Domain.EntityMember>>)[field]
      if (
        declared?._tag === 'Derived' &&
        !Schema.is(Schema.toType(declared.schema as Schema.Top))(0)
      )
        fail(
          `derived "${field}" on entity "${name}" is stored as a count, but its schema is not a number`,
        )
      computed[field] = count
    }

    bindings[key] = {
      ...descriptor,
      table: config.table,
      columns,
      relations,
      computed,
    } as unknown as EntityBinding<string, DrizzleTable>
  }
  return bindings as never
}
