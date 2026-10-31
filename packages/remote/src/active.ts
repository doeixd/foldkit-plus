/**
 * What an active record's entries read for a Model, and what a read asks of
 * the store: shared by the read entries and `foldkit-remote/why`.
 */
import { Option } from 'effect'
import type { ActiveSurface, Projection, SurfaceSource } from 'foldkit-surface'
import type { ActiveEntry } from './index.js'
import { stableStringify } from './query.js'
import {
  connectionsOf,
  requirementsOf,
  type ConnectionRequirement,
  type RelationRequirement,
  type Requirement,
} from './requirement.js'

/** What a projection asks of the remote: entity requirements and query connections. */
export interface Asked {
  readonly requirements: ReadonlyArray<Requirement>
  readonly connections: ReadonlyArray<ConnectionRequirement>
}

export const askedOf = (projection: Projection<any, unknown>): Asked => ({
  requirements: requirementsOf(projection),
  connections: connectionsOf(projection),
})

/**
 * Whether `outer` asks for everything `inner` does of one entity: each field,
 * each relation's own slice of its target, and each page window alike.
 */
const sliceCovers = (outer: RelationRequirement, inner: RelationRequirement): boolean =>
  outer.entity === inner.entity &&
  inner.fields.every(field => outer.fields.includes(field)) &&
  Object.entries(inner.relations ?? {}).every(([field, relation]) => {
    const wider = outer.relations?.[field]
    return wider !== undefined && sliceCovers(wider, relation)
  }) &&
  Object.entries(inner.windows ?? {}).every(
    ([field, window]) =>
      outer.windows?.[field] !== undefined &&
      stableStringify(outer.windows[field]) === stableStringify(window),
  )

/**
 * Whether what `outer` asks includes everything `inner` asks: each list with
 * the slice it selects of its rows, and each entity with the slice it reads,
 * relations included. A Surface that shows a read is one whose projection
 * asks for all of it; one that reads part of it cannot be why it is fetched.
 * A Surface that asks for one entity in several pieces is already one
 * requirement here: projection metadata unions them per entity and id.
 */
export const covers = (outer: Asked, inner: Asked): boolean => {
  const { connections, requirements } = outer
  return (
    inner.connections.every(connection =>
      connections.some(
        wider =>
          wider.identity === connection.identity &&
          (connection.select === undefined ||
            (wider.select !== undefined && sliceCovers(wider.select, connection.select))),
      ),
    ) &&
    inner.requirements.every(requirement =>
      requirements.some(wider => wider.id === requirement.id && sliceCovers(wider, requirement)),
    )
  )
}

/** The projection an active entry has for this Model; none while it is inactive. */
export const projectionOf = <AppModel>(
  entry: ActiveEntry<AppModel>,
  model: AppModel,
): Option.Option<Projection<AppModel, unknown>> => {
  if ('projectionOf' in entry) return entry.projectionOf(model)
  // A bare Surface without params reads whole; a source without `instancesOf`
  // cannot happen, and resolves to nothing if it does.
  if ('projection' in entry) return Option.some(entry.projection())
  return Option.none()
}

/** One of an entry's reads, named for diagnostics: a lone Surface keeps its name, a family instance takes `Child[key]`. */
export interface NamedProjection<AppModel> {
  readonly name: string
  readonly projection: Projection<AppModel, unknown>
}

/**
 * Every projection an entry resolves to for a Model: the lone one of a
 * `Surface.at`/`Surface.when` value or a bare Surface, or a family's parent
 * first and then each instance. The parent joins so an unloaded parent is
 * fetched before what it reveals; `Data.satisfy` reaches the instances in a
 * later pass. A caller that also passes the parent separately double-covers
 * its requirements, as overlapping Surfaces already do.
 */
export const resolvedOf = <AppModel>(
  entry: ActiveEntry<AppModel>,
  model: AppModel,
): ReadonlyArray<NamedProjection<AppModel>> => {
  const source = entry as Partial<SurfaceSource<AppModel>>
  if (typeof source.instancesOf === 'function') {
    const instances = source.instancesOf(model)
    const from = (entry as { readonly from?: ActiveSurface<AppModel> }).from
    // A lone `Surface.at`/`Surface.when` keeps its name; a family names each
    // instance after its key, with the parent first.
    if (from === undefined)
      return instances.map(instance => ({ name: entry.name, projection: instance.projection }))
    return [
      ...Option.toArray(from.projectionOf(model)).map(projection => ({
        name: from.name,
        projection,
      })),
      ...instances.map(instance => ({
        name: `${entry.name}[${instance.key}]`,
        projection: instance.projection,
      })),
    ]
  }
  return Option.toArray(projectionOf(entry, model)).map(projection => ({
    name: entry.name,
    projection,
  }))
}

/** What some projections ask for together: their requirements and connections unioned. */
export const askedUnion = (projections: ReadonlyArray<Projection<any, unknown>>): Asked => ({
  requirements: projections.flatMap(requirementsOf),
  connections: projections.flatMap(connectionsOf),
})
