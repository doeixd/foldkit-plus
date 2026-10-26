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
import { Match, Option, Schema, SchemaAST } from 'effect'
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
  /**
   * The fields it moves by an amount the input holds (`stock + quantity`),
   * computed where the write commits: the input key, and the field it moves.
   */
  readonly increments: ReadonlyArray<WriteSet>
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

/** The keys of `Fields` whose values are numbers. */
type NumberKeys<Fields> = {
  [K in keyof Fields & string]: Fields[K] extends Schema.Top
    ? Schema.Schema.Type<Fields[K]> extends number
      ? K
      : never
    : never
}[keyof Fields & string]

/** An update's increments: a number field of the Entity, by the input key holding the amount. */
export type WriteIncrements<E extends AnyEntity, Fields extends Schema.Struct.Fields> = {
  readonly [
    K in NumberKeys<{ [F in keyof E['fields']]: E['fields'][F]['schema'] }>
  ]?: NumberKeys<Fields>
}

/** An update's options: a row's, and what it moves by an amount. */
type UpdateOptions<
  E extends AnyEntity,
  Fields extends Schema.Struct.Fields,
> = RowOptions<Fields> & {
  readonly increment?: WriteIncrements<E, Fields>
}

/** `update`: conditioned when given `when`, which the overloads tell apart. */
interface UpdateWrite {
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: UpdateOptions<E, Fields> & { readonly when: WriteCondition<E, Fields> },
  ): ConditionedWrite<E, Fields>
  // `when?: undefined`, so an optional `when` in a variable cannot pick this one and lose `Unmet`.
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: UpdateOptions<E, Fields> & { readonly when?: undefined },
  ): Write<E, Fields>
}

/** `delete`: conditioned when given `when`, as an update is. */
interface DeleteWrite {
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: RowOptions<Fields> & { readonly when: WriteCondition<E, Fields> },
  ): ConditionedWrite<E, Fields>
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: RowOptions<Fields> & { readonly when?: undefined },
  ): Write<E, Fields>
}

// `declared` sets `when` exactly when it is given, which is what the overloads say.
const update: UpdateWrite = (
  input: EntityInput<AnyEntity, any, any>,
  options: UpdateOptions<AnyEntity, any>,
) => settingSomething(declared('Update', input, options)) as never

const remove: DeleteWrite = (input: EntityInput<AnyEntity, any, any>, options: RowOptions<any>) => {
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
  /** Each field it moves, by the amount, encoded: added by the server, and predicted over what a client holds. */
  readonly increments: Readonly<Record<string, number>>
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
    readonly increment?: Readonly<Record<string, string | undefined>>
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
  const increments = Object.entries(options.increment ?? {}).flatMap(([fieldKey, key]) =>
    key === undefined ? [] : [incrementOf(input, fieldKey, key, { expect, sets })],
  )
  return Object.freeze({
    _tag: kind,
    input,
    id: Object.freeze({ key: options.id, field: id }),
    expect,
    when,
    sets: Object.freeze(sets),
    increments: Object.freeze(increments),
    links: Object.freeze(links),
  })
}

/** Whether a value's stored form is a plain number. */
const storedAsNumber = (schema: Schema.Top): boolean =>
  SchemaAST.isNumber(Schema.toEncoded(schema).ast)

/** Whether any of these checks is `Schema.isInt`, alone or inside a group (`isInt32`). */
const checksInteger = (checks: ReadonlyArray<SchemaAST.Check<unknown>>): boolean =>
  checks.some(check =>
    Match.value(check).pipe(
      Match.tagsExhaustive({
        Filter: filter => filter.annotations?.representation?.id === 'effect/schema/isInt',
        FilterGroup: group => checksInteger(group.checks),
      }),
    ),
  )

/** Whether a value's stored form is checked to be an integer. */
const storedAsInteger = (schema: Schema.Top): boolean =>
  checksInteger(Schema.toEncoded(schema).ast.checks ?? [])

/**
 * One increment, checked: a field of the Entity stored as a number, written
 * by nothing else, moved by an unmapped input key whose value is a number, and
 * an integer when the field is one.
 */
const incrementOf = (
  input: EntityInput<AnyEntity, any, any>,
  fieldKey: string,
  key: string,
  declared: { readonly expect: WriteSet | undefined; readonly sets: ReadonlyArray<WriteSet> },
): WriteSet => {
  const fields = input.entity.fields as Readonly<Record<string, AnyField>>
  const field = Object.hasOwn(fields, fieldKey) ? fields[fieldKey] : undefined
  if (field === undefined) return fail(input, `increments "${fieldKey}", which is not a field`)
  if (fieldKey === 'id') return fail(input, 'increments the id')
  if (declared.expect?.field.key === fieldKey) {
    return fail(input, `increments "${fieldKey}", the revision it expects`)
  }
  if (declared.sets.some(set => set.field.key === fieldKey)) {
    return fail(input, `increments "${fieldKey}", which a key also sets`)
  }
  if (!storedAsNumber(field.schema as unknown as Schema.Top)) {
    return fail(input, `increments "${fieldKey}", which is not stored as a number`)
  }
  const member = membersOf(input)[key]
  if (member === undefined) return fail(input, `"${key}" is not a key of the input`)
  if (member._tag !== 'Unmapped') {
    return fail(input, `"${key}" is an amount, so it must be unmapped, not written as a member`)
  }
  const amount = input.schema.fields[key] as unknown as Schema.Top
  if (!storedAsNumber(amount)) return fail(input, `"${key}" is an amount, but not a number`)
  // The databases split over a fraction added to an integer: Postgres refuses the
  // statement, SQLite stores it in the integer column. So it never reaches either.
  if (storedAsInteger(field.schema as unknown as Schema.Top) && !storedAsInteger(amount)) {
    return fail(
      input,
      `"${key}" may not be an integer, but "${fieldKey}" is one; give the amount Schema.Int`,
    )
  }
  return Object.freeze({ key, field })
}

/** An update or an insert that would write nothing is refused where it is declared. */
const settingSomething = <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
  write: Write<E, Fields>,
): Write<E, Fields> =>
  write.sets.length === 0 && write.links.length === 0 && write.increments.length === 0
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
    ...write.increments.map(increment => increment.field),
    ...write.links.map(link => link.relation),
  ],

  /**
   * The fields a write reads from the row it writes: those its `when` reads,
   * each it increments, and the revision it expects. What an interpreter
   * must read, and what a startup check judges it could disclose.
   */
  reads: (write: AnyWrite): ReadonlyArray<AnyField> => {
    const fields = new Map<string, AnyField>()
    const add = (field: AnyField) => fields.set(field.key, field)
    Option.map(write.when, body =>
      Query.dependencies(body).predicate.forEach(field => add(field as unknown as AnyField)),
    )
    write.increments.forEach(increment => add(increment.field))
    if (write.expect !== undefined) add(write.expect.field)
    return [...fields.values()]
  },

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
    const increments: Record<string, number> = {}
    for (const { key, field } of write.increments) {
      // `keys` names input keys, so an increment is asked for by its amount's key.
      if (!asked(key)) continue
      const schema = write.input.schema.fields[key] as unknown as Schema.Codec<unknown, number>
      Option.map(given(input[key]), held => {
        increments[field.key] = Schema.encodeUnknownSync(schema)(held)
      })
    }
    return {
      entity: write.input.entity.name,
      id: String(encoded(write.id.field, input[write.id.key])),
      values,
      links,
      increments,
    }
  },
}
