/**
 * `Remote.patch`'s relation values written as the store holds them: a ref
 * becomes its ref key, and anything else in a relation is refused.
 */
import type { Schema } from 'effect'
import type { EntityDescriptor, EntityRef, RefPage } from './entity.js'
import { relationShape, type RelationShape } from './relation.js'
import { entityKey } from './store.js'

const relationShapes = new WeakMap<Schema.Struct.Fields, ReadonlyMap<string, RelationShape>>()

/** A descriptor's relation fields and their shapes, read once per descriptor. */
const relationsOf = (fields: Schema.Struct.Fields): ReadonlyMap<string, RelationShape> => {
  const known = relationShapes.get(fields)
  if (known !== undefined) return known
  const shapes = new Map<string, RelationShape>()
  for (const [key, schema] of Object.entries(fields)) {
    const shape = relationShape(schema)
    if (shape !== undefined) shapes.set(key, shape)
  }
  relationShapes.set(fields, shapes)
  return shapes
}

const isRefTo = (value: unknown, entity: string): value is EntityRef<string> =>
  value !== null &&
  typeof value === 'object' &&
  (value as Partial<EntityRef<string>>).entity === entity &&
  typeof (value as Partial<EntityRef<string>>).id === 'string'

/** One relation value as the store holds it, or a refusal naming what the field takes. */
const wireRelation = (shape: RelationShape, value: unknown, refuse: () => never): unknown => {
  if (value === undefined) return value
  if (value === null) return shape.nullable ? null : refuse()
  const key = (ref: unknown): string =>
    isRefTo(ref, shape.entity) ? entityKey(ref.entity, ref.id) : refuse()
  if (shape.kind === 'one') return key(value)
  if (shape.kind === 'many') return Array.isArray(value) ? value.map(key) : refuse()
  const page = value as Partial<RefPage<string>>
  return Array.isArray(page.refs) &&
    typeof page.hasNext === 'boolean' &&
    typeof page.hasPrevious === 'boolean'
    ? { refs: page.refs.map(key), hasNext: page.hasNext, hasPrevious: page.hasPrevious }
    : refuse()
}

/**
 * `Remote.patch`'s values as the store holds them: each relation's refs
 * written as ref keys. A relation given anything but a ref to its target (a
 * ref key typed by hand, a ref to another Entity) is refused here, where the
 * patch is made.
 */
export const wireValues = (
  descriptor: EntityDescriptor<string, Schema.Struct.Fields>,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const relations = relationsOf(descriptor.fields)
  if (relations.size === 0) return values
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => {
      const shape = relations.get(field)
      if (shape === undefined) return [field, value]
      const refuse = (): never => {
        const takes = { one: 'a ref', many: 'an array of refs', page: 'a page of refs' }[shape.kind]
        throw new Error(
          `Remote.patch: "${field}" of "${descriptor.name}" takes ${takes} to ${shape.entity} (Remote.ref(${shape.entity}, id))${shape.nullable ? ' or null' : ''}, not ${JSON.stringify(value)}`,
        )
      }
      return [field, wireRelation(shape, value, refuse)]
    }),
  )
}
