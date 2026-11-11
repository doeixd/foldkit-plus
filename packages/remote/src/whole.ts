/**
 * The lists the store holds whole (#409), which let an exists over the store
 * be false. A list read to both ends in one page, and not stale, holds every
 * row its body admits. When that body says only that some fields hold given
 * values (`Judge.pins`), it holds every row with those values, so an exists
 * whose filter fixes the same values counts no row the store lacks: the
 * viewer's whole `Following` decides whom the viewer follows.
 */
import { Option } from 'effect'
import { Judge, type ExprContext, type Pinned } from 'foldkit-entity'
import type { ListQuery } from './capability.js'
import type { Connection, Segment } from './connection.js'
import { entityKey, type EntityKey } from './store.js'

/** One list held whole: what its body fixes, and the rows it holds. */
export interface WholeList {
  readonly pins: Pinned
  readonly keys: ReadonlyArray<EntityKey>
}

/** The lists of an Entity the store holds whole, by its name. */
export type WholeLists = (entity: string) => ReadonlyArray<WholeList>

/** A connection's one page, when it was read to both ends and is not stale. */
const wholePage = (connection: Connection): Option.Option<Segment> => {
  const [only, ...rest] = connection.segments
  if (
    only === undefined ||
    rest.length !== 0 ||
    connection.stale ||
    only.start._tag !== 'Terminal' ||
    only.end._tag !== 'Terminal'
  )
    return Option.none()
  return Option.some(only)
}

/**
 * The connections held whole whose bodies only fix fields, by the Entity they
 * list; `context` is what a body's `Expr.viewer` reads. Worked out at the
 * first Entity asked for.
 */
export const wholeListsOf = (
  connections: Readonly<Record<string, Connection>>,
  queryOf: (identity: string) => Option.Option<ListQuery>,
  context: ExprContext | undefined,
): WholeLists => {
  let byEntity: ReadonlyMap<string, ReadonlyArray<WholeList>> | undefined
  const listed = () => {
    const found = new Map<string, Array<WholeList>>()
    for (const [identity, connection] of Object.entries(connections)) {
      const page = wholePage(connection)
      if (Option.isNone(page)) continue
      const body = Option.flatMap(queryOf(identity), query =>
        Option.map(Option.fromUndefinedOr(query.descriptor.body), body => ({ body, query })),
      )
      if (Option.isNone(body)) continue
      const { pins, whole } = Judge.pins(body.value.body.where, {
        input: body.value.query.encoded,
        context,
      })
      if (!whole) continue
      const entity = body.value.body.entity.name
      const lists = found.get(entity) ?? []
      lists.push({
        pins,
        keys: page.value.edges.map(edge => entityKey(edge.ref.entity, edge.ref.id)),
      })
      found.set(entity, lists)
    }
    return found
  }
  return entity => {
    byEntity ??= listed()
    return byEntity.get(entity) ?? []
  }
}
