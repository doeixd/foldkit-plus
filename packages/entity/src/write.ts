/**
 * A write as a value: what an operation changes, declared over the input it
 * takes, so the changes can be known before it runs and its interpreters can
 * agree on what it means.
 *
 * A `Write` is built on `Entity.input`, which already says which input key is
 * which member of the Entity. `Write.update` adds what to do with them: the key
 * that names the row, and optionally the key holding the revision it was read
 * at. Every other key mapped to a field is set; a key mapped to
 * `Entity.unmapped` is about the operation and is not written.
 *
 * It is authority someone declared, never something derived from an Entity: an
 * Entity having a field does not mean anyone may set it.
 */
import { Option, Schema } from 'effect'
import type {
  AnyEntity,
  EntityField,
  EntityInput,
  EntityRef,
  EntityRelation,
  InputMember,
} from './index.js'

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

/** An update of one row of an Entity, by id, from an operation's input. */
export interface Write<E extends AnyEntity, Fields extends Schema.Struct.Fields> {
  readonly _tag: 'Update'
  readonly input: EntityInput<E, Fields, any>
  /** The input key holding the row's id, and the Entity's `id` field it is. */
  readonly id: WriteSet & { readonly key: keyof Fields & string }
  /**
   * The input key holding the revision the row was read at, and its field, when
   * the write is refused for a row that moved on since.
   */
  readonly expect: (WriteSet & { readonly key: keyof Fields & string }) | undefined
  /** The keys it sets, in the input's order. */
  readonly sets: ReadonlyArray<WriteSet>
  /** The `one` relations it points elsewhere, in the input's order. */
  readonly links: ReadonlyArray<WriteLink>
}

export type AnyWrite = Write<AnyEntity, any>

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
  throw new Error(`[foldkit-entity] Write.update of ${input.entity.name}: ${message}`)
}

const membersOf = (
  input: EntityInput<AnyEntity, any, any>,
): Readonly<Record<string, InputMember | undefined>> => input.members

/** A field's value as the store holds it. A field's schema needs no service, so none is asked. */
const encoded = (field: AnyField, value: unknown): unknown =>
  Schema.encodeUnknownSync(field.schema as unknown as Schema.Codec<unknown, unknown>)(value)

const fieldAt = (input: EntityInput<AnyEntity, any, any>, key: string, role: string): AnyField => {
  const member = membersOf(input)[key]
  if (member === undefined) return fail(input, `${role} "${key}" is not a key of the input`)
  if (member._tag !== 'Field') return fail(input, `${role} "${key}" is not mapped to a field`)
  return member
}

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
   */
  update: <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: {
      readonly id: keyof Fields & string
      readonly expect?: keyof Fields & string
    },
  ): Write<E, Fields> => {
    const id = fieldAt(input, options.id, 'id')
    if (id.key !== 'id') fail(input, `id "${options.id}" is mapped to "${id.key}", not to "id"`)
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
            fail(input, `"${key}" is a many relation; an update points one relation at a time`)
          }
          links.push(Object.freeze({ key, relation: member.relation as OneRelation }))
          break
        case 'NestedInput':
          fail(input, `"${key}" writes a nested row; an update writes its own row only`)
      }
    }
    if (sets.length === 0 && links.length === 0) fail(input, 'it sets no field')
    return Object.freeze({
      _tag: 'Update' as const,
      input,
      id: Object.freeze({ key: options.id, field: id }),
      expect,
      sets: Object.freeze(sets),
      links: Object.freeze(links),
    })
  },

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
    const given = value as Readonly<Record<string, unknown>>
    const wanted = keys === undefined ? undefined : new Set(keys)
    const asked = (key: string) => wanted === undefined || wanted.has(key)
    const values: Record<string, unknown> = {}
    for (const { key, field } of write.sets) {
      if (!asked(key)) continue
      values[field.key] = encoded(field, given[key])
    }
    const links: Record<string, Option.Option<EntityRef>> = {}
    for (const { key, relation } of write.links) {
      if (!asked(key)) continue
      const target = relation.target()
      links[relation.key] = Option.map(Option.fromNullishOr(given[key]), id => ({
        entity: target.name,
        id: String(encoded(target.fields.id as AnyField, id)),
      }))
    }
    return {
      entity: write.input.entity.name,
      id: String(encoded(write.id.field, given[write.id.key])),
      values,
      links,
    }
  },
}
