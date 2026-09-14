/**
 * What a Remote Projection needs from the server: entity slices and query
 * connections. They ride on `Projection.metadata` under Remote's own keys, so
 * Surface composes them without knowing their shape.
 */
import { Metadata } from 'foldkit-surface'
import type { QueryWindow } from './query.js'

/**
 * The slice required of an entity. `windows` carries a pagination window per
 * relation field, and `relations` the slice required of each relation's
 * target, so one requirement describes a whole selection graph.
 */
export interface RelationRequirement {
  readonly entity: string
  readonly fields: readonly string[]
  readonly windows?: Readonly<Record<string, QueryWindow>> | undefined
  readonly relations?: Readonly<Record<string, RelationRequirement>> | undefined
}

export interface Requirement extends RelationRequirement {
  readonly id: string
  /** The projection also subscribes to changes of this entity (`Data.live`). */
  readonly live?: boolean | undefined
}

/**
 * A query connection a projection reads: the page it first asks for and the
 * slice it selects of each item. `identity` is the connection's (query plus
 * canonical input, excluding the window).
 */
export interface ConnectionRequirement {
  readonly identity: string
  readonly window: QueryWindow
  readonly select: RelationRequirement
}

const windowKey = (window: QueryWindow): string =>
  JSON.stringify([
    window.first ?? null,
    window.last ?? null,
    window.after ?? null,
    window.before ?? null,
  ])

/**
 * Merges connection requirements for the same connection and window into one,
 * unioning what they select of each item; the first keeps its other properties.
 */
function mergeConnections(
  connections: readonly ConnectionRequirement[],
): readonly ConnectionRequirement[] {
  const merged = new Map<string, ConnectionRequirement>()
  for (const connection of connections) {
    const key = `${connection.identity}\u0000${windowKey(connection.window)}`
    const current = merged.get(key)
    merged.set(
      key,
      current === undefined
        ? connection
        : { ...current, select: mergeRelation(current.select, connection.select) },
    )
  }
  return [...merged.values()]
}

/** Unions two relation slices for the same target: fields, windows, and nested relations. */
function mergeRelation(
  current: RelationRequirement,
  next: RelationRequirement,
): RelationRequirement {
  const fields = [...current.fields]
  const seen = new Set(fields)
  for (const field of next.fields) {
    if (seen.has(field)) continue
    seen.add(field)
    fields.push(field)
  }
  const windows = { ...current.windows, ...next.windows }
  const relations = mergeRelations(current.relations, next.relations)
  return {
    entity: current.entity,
    fields,
    ...(Object.keys(windows).length === 0 ? {} : { windows }),
    ...(relations === undefined ? {} : { relations }),
  }
}

/** Unions two relation maps field by field; a field in both merges recursively. */
function mergeRelations(
  current: Readonly<Record<string, RelationRequirement>> | undefined,
  next: Readonly<Record<string, RelationRequirement>> | undefined,
): Readonly<Record<string, RelationRequirement>> | undefined {
  if (current === undefined) return next
  if (next === undefined) return current
  const merged: Record<string, RelationRequirement> = { ...current }
  for (const [field, relation] of Object.entries(next)) {
    const existing = merged[field]
    merged[field] = existing === undefined ? relation : mergeRelation(existing, relation)
  }
  return merged
}

/** Unions requirements for the same entity + id, dropping duplicate fields. */
function mergeRequirements(requirements: readonly Requirement[]): readonly Requirement[] {
  const grouped = new Map<string, Requirement>()
  for (const requirement of requirements) {
    const key = `${requirement.entity}\u0000${requirement.id}`
    // Later windows win; a duplicate is a caller bug, not a merge policy.
    const group = grouped.get(key)
    const live = group?.live === true || requirement.live === true
    grouped.set(key, {
      ...mergeRelation(group ?? { entity: requirement.entity, fields: [] }, requirement),
      id: requirement.id,
      ...(live ? { live } : {}),
    })
  }
  return [...grouped.values()]
}

/**
 * Requirement helpers, for the packages that plan and serve requirements.
 * `merge` unions same-entity+id requirements; `mergeRelation` unions two
 * slices of one target (fields, windows, nested relations).
 */
export const Requirement = {
  merge: mergeRequirements,
  mergeRelation,
  mergeConnections,
}

/** Remote's entity requirements on a Projection, unioned per entity and id as nodes compose. */
export const RemoteRequirements = Metadata.key<Requirement>('remote', {
  merge: mergeRequirements,
  summarize: requirement => `${requirement.entity}:${requirement.id}`,
})

/** Remote's query connections on a Projection, unioned per connection and window. */
export const RemoteConnections = Metadata.key<ConnectionRequirement>('remote.connection', {
  merge: mergeConnections,
  summarize: connection => connection.identity.split('\u0000').join(' '),
})

/** The entity requirements a Projection carries. */
export const requirementsOf = (projection: {
  readonly metadata: Metadata
}): ReadonlyArray<Requirement> => RemoteRequirements.get(projection.metadata)

/** The query connections a Projection carries. */
export const connectionsOf = (projection: {
  readonly metadata: Metadata
}): ReadonlyArray<ConnectionRequirement> => RemoteConnections.get(projection.metadata)
