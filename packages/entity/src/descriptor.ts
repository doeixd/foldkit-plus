/**
 * What makes an Entity descriptor: its parts, the members every descriptor of
 * one Entity shares, and making a new descriptor from them. Apart from the
 * `Entity` namespace, so an invariant attaches itself without importing it.
 */
import { Option, Pipeable, type Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { EntityTypeId } from './ids.js'
import type { AnyEntity, EntityIdentity, EntityMember } from './index.js'
import { own, put } from './record.js'
import type { EntitySet } from './sets.js'
import { variantsOf } from './variants.js'

/**
 * What every descriptor of one Entity shares: the members `Entity.relate`,
 * `Entity.derived` and `Entity.sets` add. It belongs to the identity, so a
 * member added through one descriptor is a member of every other, the one a
 * relation's `target()` returns and the one declared before `relate` alike.
 */
interface Shape {
  readonly relations: Record<string, EntityMember>
  readonly derived: Record<string, EntityMember>
  readonly sets: Record<string, EntitySet>
  /** Moves with every addition, so a descriptor knows when its view is stale. */
  revision: number
}

const shapes = new WeakMap<EntityIdentity<string>, Shape>()

const shapeOf = (identity: EntityIdentity<string>): Shape => {
  const known = shapes.get(identity)
  if (known !== undefined) return known
  const shape: Shape = { relations: {}, derived: {}, sets: {}, revision: 0 }
  shapes.set(identity, shape)
  return shape
}

/** What one descriptor holds of its own: its fields, and the metadata annotated on it. */
interface Parts {
  readonly identity: EntityIdentity<string>
  readonly schema: Schema.Struct<Schema.Struct.Fields>
  readonly fields: Readonly<Record<string, EntityMember>>
  /** Metadata `annotateMembers` gave this descriptor's relations and derived members, by key. */
  readonly annotated: Readonly<Record<string, Metadata>>
  readonly metadata: Metadata
}

export const partsOf = new WeakMap<AnyEntity, Parts>()

const EntityProto = {
  [EntityTypeId]: EntityTypeId,
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  },
}

export const make = (parts: Parts): AnyEntity => {
  const shape = shapeOf(parts.identity)
  const fields = Object.freeze(parts.fields)
  // A shared member annotated here is a copy, made once, so it keeps its identity across reads.
  const copies = new WeakMap<EntityMember, EntityMember>()
  const annotate = (members: Readonly<Record<string, EntityMember>>) =>
    Object.freeze(
      mapValues(members, (member, key) => {
        const extra = own(parts.annotated, key)
        if (extra === undefined) return member
        const copied = copies.get(member)
        if (copied !== undefined) return copied
        const copy = Object.freeze({
          ...member,
          metadata: Metadata.combine([member.metadata, extra]),
        })
        copies.set(member, copy)
        return copy
      }),
    )
  let seen = -1
  let view: {
    readonly relations: Readonly<Record<string, EntityMember>>
    readonly derived: Readonly<Record<string, EntityMember>>
    readonly sets: Readonly<Record<string, EntitySet>>
    readonly members: Readonly<Record<string, EntityMember>>
  }
  const current = () => {
    if (seen !== shape.revision) {
      const relations = annotate(shape.relations)
      const derived = annotate(shape.derived)
      view = {
        relations,
        derived,
        sets: Object.freeze({ ...shape.sets }),
        members: Object.freeze({ ...fields, ...relations, ...derived }),
      }
      seen = shape.revision
    }
    return view
  }
  const entity = Object.create(EntityProto)
  Object.defineProperties(entity, {
    identity: { value: parts.identity, enumerable: true },
    name: { value: parts.identity.name, enumerable: true },
    schema: { value: parts.schema, enumerable: true },
    fields: { value: fields, enumerable: true },
    relations: { get: () => current().relations, enumerable: true },
    derived: { get: () => current().derived, enumerable: true },
    members: { get: () => current().members, enumerable: true },
    sets: { get: () => current().sets, enumerable: true },
    metadata: { value: parts.metadata, enumerable: true },
  })
  Option.map(variantsOf(parts.identity), ({ union }) =>
    Object.defineProperty(entity, 'variants', { value: union, enumerable: true }),
  )
  partsOf.set(entity, parts)
  return Object.freeze(entity)
}

/** A new descriptor of the same Entity, with some of its own parts changed. */
export const remake = (entity: AnyEntity, changed: Partial<Parts>): AnyEntity =>
  make({ ...partsOf.get(entity)!, ...changed })

/** Adds to the Entity's shared members, which every descriptor of it then reads. */
export const extend = (
  entity: AnyEntity,
  added: {
    readonly relations?: Readonly<Record<string, EntityMember>>
    readonly derived?: Readonly<Record<string, EntityMember>>
    readonly sets?: Readonly<Record<string, EntitySet>>
  },
): void => {
  const shape = shapeOf(entity.identity)
  for (const [key, member] of Object.entries(added.relations ?? {}))
    put(shape.relations, key, member)
  for (const [key, member] of Object.entries(added.derived ?? {})) put(shape.derived, key, member)
  for (const [key, set] of Object.entries(added.sets ?? {})) put(shape.sets, key, set)
  shape.revision += 1
}

export const mapValues = <A, B>(
  record: Readonly<Record<string, A>>,
  f: (value: A, key: string) => B,
): Record<string, B> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, f(value, key)]))

/**
 * A variant Entity's descriptor as declared, by its identity: each case's
 * invariant is built over its fields when first read.
 */
export const variantBases = new WeakMap<EntityIdentity<string>, AnyEntity>()
