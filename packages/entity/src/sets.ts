/**
 * What `Entity.sets` declares: members whose value is the write's context,
 * never its input, and the writes that set them.
 */
import { Option, Schema, SchemaAST } from 'effect'
import { isExpr } from '@doeixd/metakit/build'
import type { ContextValue } from './context.js'
import { originTagged } from './expr/operand.js'
import type { AnyEntity, EntityMember } from './index.js'
import { SchemaShape } from './shape.js'

/** The writes that set a member: every insert (`create`), or every insert and update (`write`). */
export type SetOn = 'create' | 'write'

export type { ContextValue }

/** One member `Entity.sets` names: its value, and the writes that set it. */
export interface EntitySet {
  readonly value: ContextValue
  readonly on: SetOn
}

const fail = (entity: AnyEntity, message: string): never => {
  throw new Error(`Entity "${entity.name}": ${message}`)
}

/** How a field's values are stored, nulls aside: as text, as a number, or otherwise. */
const storedAs = (schema: Schema.Top): 'text' | 'number' | 'other' => {
  const stored = SchemaShape.present(Schema.toEncoded(schema).ast)
  if (stored.every(SchemaShape.isText)) return 'text'
  if (stored.every(SchemaAST.isNumber)) return 'number'
  return 'other'
}

const termOf = (value: unknown): unknown =>
  isExpr(value) && 'term' in value ? value.term : undefined

/**
 * `value` checked against the member `key` it sets, as `Entity.sets` was
 * given them: a relation takes `Expr.viewer` of its target, a field stored as
 * text the viewer's id, a field stored as a number the time.
 */
export const checkedSet = (
  entity: AnyEntity,
  key: string,
  value: unknown,
  on: unknown,
): EntitySet => {
  if (on !== 'create' && on !== 'write') {
    return fail(entity, `sets "${key}" on ${String(on)}; say on: 'create' or on: 'write'`)
  }
  if (key === 'id') return fail(entity, 'sets the id, which the client names')
  if (Object.hasOwn(entity.sets, key)) return fail(entity, `"${key}" is set already`)
  const term = termOf(value)
  if (term !== 'viewer' && term !== 'now' && term !== 'viewerPath') {
    return fail(
      entity,
      `sets "${key}" to what is no value of the write's context (Expr.viewer, a path from it, Expr.now); a value from the input is a computed assignment`,
    )
  }
  const context = value as ContextValue
  const relations: Readonly<Record<string, EntityMember>> = entity.relations
  const fields: Readonly<Record<string, EntityMember>> = entity.fields
  const member = Object.hasOwn(relations, key)
    ? relations[key]
    : Object.hasOwn(fields, key)
      ? fields[key]
      : undefined
  if (member === undefined) {
    return fail(entity, `sets "${key}", which is not a field or relation`)
  }
  if (member._tag === 'Relation') {
    if (member.cardinality !== 'one') return fail(entity, `sets "${key}", a many relation`)
    const target = member.target()
    if (context.term !== 'viewer' || context.entity.token !== target.identity.token) {
      return fail(entity, `sets the relation "${key}" to what is not Expr.viewer(${target.name})`)
    }
    return { value: context, on }
  }
  const stored = storedAs(member.schema as Schema.Top)
  switch (context.term) {
    case 'now':
      if (stored !== 'number') {
        fail(entity, `sets "${key}" to the time, but it is not stored as a number`)
      }
      break
    case 'viewer':
      if (stored !== 'text') {
        fail(entity, `sets "${key}" to the viewer's id, but it is not stored as text`)
      }
      break
    case 'viewerPath':
      Option.map(originTagged(context.node, 'ViewerHop'), ({ field }) => {
        if (stored === 'other' || storedAs(field.schema) !== stored) {
          fail(
            entity,
            `sets "${key}" to what ${field.owner.name}.${field.key} holds, which it is not stored as`,
          )
        }
      })
      break
  }
  return { value: context, on }
}
