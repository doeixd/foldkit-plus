/**
 * A write as a value: what an operation changes, declared over the input it
 * takes, so the changes can be known before it runs and its interpreters can
 * agree on what it means.
 *
 * A `Write` is built on `Entity.input`, which already says which input key is
 * which member of the Entity. `Write.update`, `Write.insert` and `Write.delete`
 * add what to do with them: the key that names the row, and optionally the key
 * holding the revision it was read at. Every other key mapped to a field is
 * set; a key mapped to `Entity.unmapped` is about the operation and is not
 * written.
 *
 * It is authority someone declared, never something derived from an Entity: an
 * Entity having a field does not mean anyone may set it.
 */
import { Option, Schema, SchemaAST } from 'effect'
import type {
  AnyEntity,
  EntityField,
  EntityInput,
  EntityRef,
  EntityRelation,
  InputMember,
} from './index.js'
import { Expr, Query, type AnyQuery, type InputExpr, type Predicate, type Reads } from './expr.js'

type AnyField = EntityField<string, string, Schema.Constraint>
type OneRelation = EntityRelation<string, string, AnyEntity, 'one', boolean>

/** One input key the write sets, and the field it sets. */
export interface WriteSet {
  readonly key: string
  readonly field: AnyField
}

/** One input key the write points at another row with: a `one` relation, by the target's id. */
export interface WriteLink {
  readonly key: string
  readonly relation: OneRelation
}

/**
 * One row of an Entity, by id, from an operation's input: updated, inserted
 * with an id the client chose, or deleted.
 */
export interface Write<E extends AnyEntity, Fields extends Schema.Struct.Fields> {
  readonly _tag: 'Update' | 'Insert' | 'Delete'
  readonly input: EntityInput<E, Fields, any>
  /** The input key holding the row's id, and the Entity's `id` field it is. */
  readonly id: WriteSet & { readonly key: keyof Fields & string }
  /**
   * The input key holding the revision the row was read at, and its field, when
   * the write is refused for a row that moved on since.
   */
  readonly expect: (WriteSet & { readonly key: keyof Fields & string }) | undefined
  /**
   * What the row must hold for the write to land, over the Entity, read
   * before the write and checked where it commits: an interpreter writes only
   * a row it holds of, and refuses the rest as unmet.
   */
  readonly when: Option.Option<AnyQuery>
  /** The keys it sets, in the input's order. */
  readonly sets: ReadonlyArray<WriteSet>
  /** The `one` relations it points elsewhere, in the input's order. */
  readonly links: ReadonlyArray<WriteLink>
}

export type AnyWrite = Write<AnyEntity, any>

/** A write declared with a precondition, so it may be refused as unmet. */
export type ConditionedWrite<E extends AnyEntity, Fields extends Schema.Struct.Fields> = Write<
  E,
  Fields
> & { readonly when: Option.Some<AnyQuery> }

interface RowOptions<Fields extends Schema.Struct.Fields> {
  readonly id: keyof Fields & string
  readonly expect?: keyof Fields & string
}

/** `update` or `delete`: conditioned when given `when`, which the overloads tell apart. */
interface RowWrite {
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: RowOptions<Fields> & { readonly when: WriteCondition<E, Fields> },
  ): ConditionedWrite<E, Fields>
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: RowOptions<Fields>,
  ): Write<E, Fields>
}

// `declared` sets `when` exactly when it is given, which is what the overloads say.
const update: RowWrite = (input: EntityInput<AnyEntity, any, any>, options: RowOptions<any>) =>
  settingSomething(declared('Update', input, options)) as never

const remove: RowWrite = (input: EntityInput<AnyEntity, any, any>, options: RowOptions<any>) => {
  const write = declared('Delete', input, options)
  const named = [...write.sets, ...write.links][0]
  if (named !== undefined) fail(input, `a delete sets nothing, but "${named.key}" is mapped`)
  return write as never
}

/**
 * A write's precondition: a predicate over its Entity's row, given one
 * placeholder per input key, as a `Query.define` body is. It is built once,
 * so `input` stands for what the write will be given.
 */
export type WriteCondition<E extends AnyEntity, Fields extends Schema.Struct.Fields> = (context: {
  readonly input: {
    readonly [K in keyof Fields & string]: InputExpr<Schema.Schema.Type<Fields[K]>>
  }
}) => Predicate & Reads<E['name']>

/** One row's new values, in the store's wire shape: what a client patches and a server writes. */
export interface BoundWrite {
  readonly entity: string
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
  /**
   * Each `one` relation it points, by the relation's key: the row it points at,
   * or none for an optional relation set to nothing. How a ref is carried (a
   * key on the wire, a foreign key in a table) is each interpreter's.
   */
  readonly links: Readonly<Record<string, Option.Option<EntityRef>>>
}

const fail = (input: EntityInput<AnyEntity, any, any>, message: string): never => {
  throw new Error(`[foldkit-entity] Write of ${input.entity.name}: ${message}`)
}

const membersOf = (
  input: EntityInput<AnyEntity, any, any>,
): Readonly<Record<string, InputMember | undefined>> => input.members

/** A field's value as the store holds it. A field's schema needs no service, so none is asked. */
const encoded = (field: AnyField, value: unknown): unknown =>
  Schema.encodeUnknownSync(field.schema as unknown as Schema.Codec<unknown, unknown>)(value)

/**
 * A key's value as given, when it was: an absent key, and an `Option` that
 * holds nothing, give none, and a `Some` what it holds. What `Entity.input`
 * lets a key map itself to, a write can bind.
 */
const given = (value: unknown): Option.Option<unknown> => {
  if (value === undefined) return Option.none()
  return Option.isOption(value) ? value : Option.some(value)
}

const fieldAt = (input: EntityInput<AnyEntity, any, any>, key: string, role: string): AnyField => {
  const member = membersOf(input)[key]
  if (member === undefined) return fail(input, `${role} "${key}" is not a key of the input`)
  if (member._tag !== 'Field') return fail(input, `${role} "${key}" is not mapped to a field`)
  return member
}

/**
 * What every kind shares: the key naming the row, the expected revision, and
 * what the other keys set or point. A kind adds its own checks.
 */
const declared = <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
  kind: Write<E, Fields>['_tag'],
  input: EntityInput<E, Fields, any>,
  options: {
    readonly id: keyof Fields & string
    readonly expect?: keyof Fields & string
    readonly when?: WriteCondition<E, Fields> | undefined
  },
): Write<E, Fields> => {
  const id = fieldAt(input, options.id, 'id')
  if (id.key !== 'id') fail(input, `id "${options.id}" is mapped to "${id.key}", not to "id"`)
  const idSchema = input.schema.fields[options.id] as unknown as Schema.Top
  const takes = Schema.is(Schema.toType(idSchema) as Schema.Codec<unknown>)
  if (SchemaAST.isOptional(idSchema.ast) || takes(undefined) || takes(Option.none()))
    fail(input, `id "${options.id}" may be absent, and a declared write names its row`)
  if (options.expect === options.id) fail(input, 'expect cannot be the id')
  const expect =
    options.expect === undefined
      ? undefined
      : Object.freeze({ key: options.expect, field: fieldAt(input, options.expect, 'expect') })
  const sets: Array<WriteSet> = []
  const links: Array<WriteLink> = []
  for (const [key, member] of Object.entries(membersOf(input))) {
    if (member === undefined || key === options.id || key === options.expect) continue
    switch (member._tag) {
      case 'Field':
        sets.push(Object.freeze({ key, field: member }))
        break
      case 'Unmapped':
        break
      case 'RelationInput':
        if (member.relation.cardinality !== 'one') {
          fail(input, `"${key}" is a many relation; a write points one relation at a time`)
        }
        links.push(Object.freeze({ key, relation: member.relation as OneRelation }))
        break
      case 'NestedInput':
        fail(input, `"${key}" writes a nested row; a write writes its own row only`)
    }
  }
  const when = Option.map(Option.fromUndefinedOr(options.when), condition => {
    const placeholders: Record<string, InputExpr<unknown>> = Object.create(null)
    for (const [key, schema] of Object.entries(input.schema.fields)) {
      placeholders[key] = Expr.input(key, schema as unknown as Schema.Codec<unknown, unknown>)
    }
    // `where` refuses a predicate over another Entity, which the type allows when it is unmarked.
    return Query.from(input.entity).pipe(
      Query.where(condition({ input: placeholders as never }) as Predicate),
    ) as AnyQuery
  })
  return Object.freeze({
    _tag: kind,
    input,
    id: Object.freeze({ key: options.id, field: id }),
    expect,
    when,
    sets: Object.freeze(sets),
    links: Object.freeze(links),
  })
}

/** An update or an insert that would write nothing is refused where it is declared. */
const settingSomething = <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
  write: Write<E, Fields>,
): Write<E, Fields> =>
  write.sets.length === 0 && write.links.length === 0
    ? fail(write.input, 'it sets no field')
    : write

export const Write = {
  /**
   * Sets, on the row whose id is the input's `id` key, every field the input
   * maps a key to. `expect` names the key holding the revision the row was
   * read at: an interpreter writes only a row still at that revision.
   *
   * ```ts
   * const EditPost = Write.update(EditPostInput, { id: 'id' })
   * ```
   *
   * A key mapped to a `one` relation (`Relation.input`) points the row at the
   * id it holds. Refused where it is written: an `id` that is not the Entity's
   * `id` field, a `many` relation or a nested key (not written by an update
   * yet), or nothing to set.
   *
   * `when` is what the row must hold for the update to land, checked where it
   * commits (`({ input }) => Expr.eq(Post.fields.status, 'draft')`); a row it
   * does not hold of is refused as unmet.
   */
  update,

  /**
   * Inserts the row whose id is the input's `id` key, an id the client chose,
   * with every field and `one` relation the input maps a key to. An insert
   * expects no revision: there is no row to have read. A row already there
   * under that id (a retry) is left as it is.
   */
  insert: <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: { readonly id: keyof Fields & string },
  ): Write<E, Fields> => {
    return settingSomething(declared('Insert', input, options))
  },

  /**
   * Deletes the row whose id is the input's `id` key, only while it is still at
   * the revision `expect` names, when it names one. It sets nothing, so a key
   * mapped to a member is refused where it is written. A row already gone (a
   * retry) is gone. `when`, as an update's, is what the row must hold.
   */
  delete: remove,

  /**
   * The revision this input says the row was read at, encoded, with its field:
   * what an interpreter writes only a row still at. None for a write that
   * expects none.
   */
  expected: <Fields extends Schema.Struct.Fields>(
    write: Write<AnyEntity, Fields>,
    value: Schema.Struct.Type<Fields>,
  ): Option.Option<{ readonly field: string; readonly revision: unknown }> =>
    Option.map(Option.fromUndefinedOr(write.expect), ({ key, field }) => ({
      field: field.key,
      revision: encoded(field, (value as Readonly<Record<string, unknown>>)[key]),
    })),

  /** The members any invocation may write: what a query reading none of them cannot be changed by. */
  writes: (write: AnyWrite): ReadonlyArray<AnyField | OneRelation> => [
    ...write.sets.map(set => set.field),
    ...write.links.map(link => link.relation),
  ],

  /**
   * The row this input writes and its new values, encoded as the store holds
   * them: the patch a client shows before the server answers. `keys`, when
   * given, narrows it to those input keys (what an author changed); the rest of
   * the input is still the whole, validated value.
   */
  bind: <Fields extends Schema.Struct.Fields>(
    write: Write<AnyEntity, Fields>,
    value: Schema.Struct.Type<Fields>,
    keys?: ReadonlyArray<string>,
  ): BoundWrite => {
    const input = value as Readonly<Record<string, unknown>>
    const wanted = keys === undefined ? undefined : new Set(keys)
    const asked = (key: string) => wanted === undefined || wanted.has(key)
    const values: Record<string, unknown> = {}
    for (const { key, field } of write.sets) {
      if (!asked(key)) continue
      // A key the input leaves out, or an `Option` holding nothing, writes nothing.
      Option.map(given(input[key]), held => {
        values[field.key] = encoded(field, held)
      })
    }
    const links: Record<string, Option.Option<EntityRef>> = {}
    for (const { key, relation } of write.links) {
      if (!asked(key)) continue
      const target = relation.target()
      links[relation.key] = Option.map(
        Option.flatMap(given(input[key]), Option.fromNullishOr),
        id => ({ entity: target.name, id: String(encoded(target.fields.id as AnyField, id)) }),
      )
    }
    return {
      entity: write.input.entity.name,
      id: String(encoded(write.id.field, input[write.id.key])),
      values,
      links,
    }
  },
}
