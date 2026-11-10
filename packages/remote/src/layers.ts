/**
 * The layer capability (#378): what shows pending layers and overlays over the
 * committed store, places pending rows in the lists that hold them, and keeps
 * the layers as requests start and settle. A domain loads it only through what
 * makes a layer: a Mutation it registers, `overlay`, or a live insert.
 */
import { Option } from 'effect'
import type { ExprContext, MemoryOperators } from 'foldkit-entity'
import type { Install, LayerCapability, Lists } from './capability.js'
import { items, type Connection, type Edge } from './connection.js'
import type { Kept } from './kept.js'
import { changesOf, readsThrough, rejudged } from './impact.js'
import { memoRead } from './memo.js'
import {
  beginOptimistic,
  goneIn,
  heldOnlyByRequests,
  plannedStore,
  pruneOverlays,
  resolvedPatches,
  settleFailure,
  settleSuccess,
  visibleItems,
  visibleStore,
  type ConnectionOverlay,
  type EntityLayer,
  type OptimisticState,
} from './optimistic.js'
import { RowPlace, placeIn, withEdge } from './placement.js'
import { placedHeld } from './placing.js'
import { entityKey, type EntityStore } from './store.js'
import { tableOf } from './table.js'
import { wholeListsOf } from './whole.js'

// The visible store is recomputed only when the base store or the layers
// change, so reads and plans across renders of one Model share it. Keyed on
// the layers rather than the whole optimistic state, which also changes with
// every overlay (a live insert, a page pruning one) that no layer is part of.
// By the client's table, then the layers, then the kept values, then the store: a
// prediction depends on all four.
const visibleStores = new WeakMap<
  MemoryOperators,
  WeakMap<object, WeakMap<Kept, WeakMap<EntityStore, EntityStore>>>
>()

const visibleStoreOf = (
  entities: EntityStore,
  optimistic: OptimisticState,
  kept: Kept,
  operators: MemoryOperators,
): EntityStore => {
  let byLayers = visibleStores.get(operators)
  if (byLayers === undefined) {
    byLayers = new WeakMap()
    visibleStores.set(operators, byLayers)
  }
  let byKept = byLayers.get(optimistic.layers)
  if (byKept === undefined) {
    byKept = new WeakMap()
    byLayers.set(optimistic.layers, byKept)
  }
  let byStore = byKept.get(kept)
  if (byStore === undefined) {
    byStore = new WeakMap()
    byKept.set(kept, byStore)
  }
  let visible = byStore.get(entities)
  if (visible === undefined) {
    visible = visibleStore(entities, optimistic, kept, operators)
    byStore.set(entities, visible)
  }
  return visible
}

// A visible store is made from one store and one set of layers, so it keys
// what is planned over it; the read entries ask on every Model change.
const plannedStores = new WeakMap<EntityStore, EntityStore>()

const plannedStoreOf = (
  entities: EntityStore,
  optimistic: OptimisticState,
  visible: EntityStore,
): EntityStore => {
  let planned = plannedStores.get(visible)
  if (planned === undefined) {
    planned = plannedStore(entities, visible, optimistic)
    plannedStores.set(visible, planned)
  }
  return planned
}

/**
 * What a list body's context reads while pending layers are placed: the
 * viewer the newest operation was predicted for. The viewer is the
 * reader's, so every operation since the last `forget` names the same one.
 */
const layersContext = (layers: ReadonlyArray<EntityLayer>): ExprContext | undefined => {
  const viewer = [...layers].reverse().find(layer => Option.isSome(layer.viewer))?.viewer
  return viewer === undefined ? undefined : { viewer, now: Option.none() }
}

/**
 * A loaded list with the pending layers placed in its pages, so a row a
 * pending edit moves, or takes out of the list, shows where its answer
 * will be placed until the edit settles. A layer writing what the body
 * reads through other rows judges the whole list again, an exists decided
 * over the `connections` held whole.
 */
const pendingPlaced = (
  lists: Lists,
  entities: EntityStore,
  optimistic: OptimisticState,
  kept: Kept,
  connections: Readonly<Record<string, Connection>>,
  identity: string,
  pages: Connection,
): Connection => {
  const { layers } = optimistic
  if (layers.length === 0) return pages
  const operators = tableOf(lists.operators)
  // Two domains may read one Model with different tables, so the table is a scope too.
  return memoRead(
    [pages, layers, kept, entities, connections, operators],
    `placed:${identity}`,
    () => {
      const changes = changesOf(
        {
          entities: resolvedPatches(entities, optimistic, kept, operators),
          deleted: layers.flatMap(layer => layer.deletes),
        },
        entities,
      )
      const store = visibleStoreOf(entities, optimistic, kept, operators)
      const context = layersContext(layers)
      const placed = placedHeld(lists, identity, pages, changes, store, context)
      // A layer writing what the body reads through other rows may move any row of the list.
      return Option.match(lists.queryOf(identity), {
        onNone: () => placed,
        onSome: query => {
          const body = query.descriptor.body
          if (body === undefined || !changes.some(change => readsThrough(body, change)))
            return placed
          const holds = new Set(items(placed).map(edge => edge.key))
          return rejudged({ ...query, connection: placed, holds }, store, {
            operators,
            context,
            whole: wholeListsOf(connections, lists.queryOf, context),
          })
        },
      })
    },
  )
}

const insertsPlaced = (
  lists: Lists,
  entities: EntityStore,
  optimistic: OptimisticState,
  kept: Kept,
  identity: string,
  pages: Connection,
): { readonly pages: Connection; readonly overlays: ReadonlyArray<ConnectionOverlay> } => {
  const { overlays } = optimistic
  const operators = tableOf(lists.operators)
  const store = visibleStoreOf(entities, optimistic, kept, operators)
  return memoRead([pages, overlays, store], `inserted:${identity}`, () => {
    const query = lists.queryOf(identity)
    const body = Option.isSome(query) ? query.value.descriptor.body : undefined
    if (Option.isNone(query) || body === undefined) return { pages, overlays }
    // A row a later remove hides is placed too: `visibleItems` hides it
    // wherever it is.
    const inserted = new Map<string, Edge>()
    for (const overlay of overlays) {
      if (overlay.connection !== identity || overlay.position === 'remove') continue
      for (const edge of overlay.edges) inserted.set(edge.key, edge)
    }
    const held = new Set(items(pages).map(edge => edge.key))
    let placed = pages
    const outside: Array<Edge> = []
    for (const edge of inserted.values()) {
      if (held.has(edge.key)) continue
      const key = entityKey(edge.ref.entity, edge.ref.id)
      RowPlace.$match(placeIn(store, placed, body, query.value.encoded, key, operators), {
        Before: place => void (placed = withEdge(placed, edge, place)),
        End: place => void (placed = withEdge(placed, edge, place)),
        Outside: () => void outside.push(edge),
        Unknown: () => undefined,
      })
    }
    return {
      pages: placed,
      overlays:
        outside.length === 0
          ? overlays
          : [
              ...overlays,
              { id: 'placed:outside', connection: identity, edges: outside, position: 'remove' },
            ],
    }
  })
}

/**
 * The edges a loaded list shows: its pages with pending edits placed, and
 * each row an insert overlay shows (a pending create, a confirmed or a live
 * insert) where the body's order puts it, or left out when it sorts past
 * what is loaded. An overlay says a row is in the list; in a list the
 * client can place, the order says where. A row it cannot place stays at
 * the end its overlay names.
 */
const shown = (
  lists: Lists,
  entities: EntityStore,
  optimistic: OptimisticState,
  kept: Kept,
  connections: Readonly<Record<string, Connection>>,
  identity: string,
  connection: Connection,
): ReadonlyArray<Edge> => {
  const pages = pendingPlaced(lists, entities, optimistic, kept, connections, identity, connection)
  const inserts = optimistic.overlays.some(
    overlay => overlay.connection === identity && overlay.position !== 'remove',
  )
  const placed = inserts
    ? insertsPlaced(lists, entities, optimistic, kept, identity, pages)
    : { pages, overlays: optimistic.overlays }
  return visibleItems(placed.pages, identity, placed.overlays, goneIn(entities, optimistic))
}

export const layers: LayerCapability = {
  visible: (entities, optimistic, kept, operators) =>
    visibleStoreOf(entities, optimistic, kept, tableOf(operators)),
  planned: plannedStoreOf,
  requestOnly: heldOnlyByRequests,
  gone: goneIn,
  edges: (entities, optimistic, identity, connection) =>
    visibleItems(connection, identity, optimistic.overlays, goneIn(entities, optimistic)),
  shown,
  context: layersContext,
  begin: beginOptimistic,
  settleSuccess,
  settleFailure,
  pruneOverlays,
}

/** Installs the layer capability; whatever makes a layer calls it first. */
export const installLayers: Install = capabilities => {
  capabilities.layers = Option.some(layers)
}
