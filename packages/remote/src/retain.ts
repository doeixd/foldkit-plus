/**
 * Cache lifetime. Retention roots are the requirements (and connections) the
 * application's active Surfaces observe; `gc` keeps what they reach through
 * the store's refs plus every pending optimistic change, and drops the rest.
 * Roots live outside the Model, so GC arrives as a Message.
 */
import type { RelationRequirement, Requirement } from './requirement.js'
import { refsIn } from './relation.js'
import { entityKey, readField, type EntityKey, type EntityStore } from './store.js'
import type { Connection } from './connection.js'
import type { OptimisticState } from './optimistic.js'
import type { MutationState } from './ledger.js'

/** A connection to keep: its identity, and what a page of it selects of each item, if a projection reads it. */
export interface ConnectionRoot {
  readonly identity: string
  readonly select?: RelationRequirement | undefined
  /**
   * Every call reading it ages it (`staleWhileRevalidate`), so once left it
   * is held as it is and its age says when it is due. Otherwise a list left
   * is held stale, and going back refetches it.
   */
  readonly ages?: boolean | undefined
}

export interface RetentionRoots {
  readonly requirements: ReadonlyArray<Requirement>
  /** Connections (`QueryRef.identity`) to keep, with their edges' targets and what `select` reaches through them. */
  readonly connections: ReadonlyArray<ConnectionRoot>
}

export interface Retained {
  readonly entities: EntityStore
  readonly connections: Readonly<Record<string, Connection>>
  readonly optimistic: OptimisticState
}

/**
 * A walk of what roots reach, one root at a time: a read keeps its row, the
 * targets its retained fields refer to, and recursively the targets a nested
 * relation selects; a list keeps its edges' targets and what its `select`
 * reaches through them. `held` counts the kept keys the store holds, as they
 * are kept, so a caller can read what each root adds: a string field may
 * name no row, and is kept all the same.
 */
const reacher = (store: EntityStore, connections: Readonly<Record<string, Connection>>) => {
  const kept = new Set<EntityKey>()
  let held = 0
  const add = (key: EntityKey): void => {
    if (kept.has(key)) return
    kept.add(key)
    if (Object.hasOwn(store, key)) held++
  }
  // A target is walked once per relation spec that reaches it: two specs may
  // select different nested relations of the same entity, and a spec tree is
  // finite, so this terminates on cyclic data too.
  const walked = new Map<EntityKey, Set<Omit<Requirement, 'id'>>>()
  const visit = (key: EntityKey, requirement: Omit<Requirement, 'id'>): void => {
    add(key)
    const seen = walked.get(key) ?? new Set()
    if (seen.has(requirement)) return
    seen.add(requirement)
    walked.set(key, seen)
    for (const field of requirement.fields) {
      const value = readField(store, key, field)
      if (value._tag === 'None') continue
      const relation = requirement.relations?.[field]
      for (const ref of refsIn(value.value)) {
        const target = entityKey(ref.entity, ref.id)
        if (relation === undefined || ref.entity !== relation.entity) {
          add(target)
          continue
        }
        visit(target, relation)
      }
    }
  }
  return {
    kept,
    held: (): number => held,
    add,
    read: (root: Requirement): void => visit(entityKey(root.entity, root.id), root),
    // The page stays readable: an item's owner, say, is kept with the item.
    list: ({ identity, select }: ConnectionRoot): void => {
      for (const segment of connections[identity]?.segments ?? []) {
        for (const edge of segment.edges) {
          const target = entityKey(edge.ref.entity, edge.ref.id)
          if (select === undefined || edge.ref.entity !== select.entity) add(target)
          else visit(target, select)
        }
      }
    },
  }
}

/**
 * What a pending request changes, kept whole until it settles: the rows its
 * layer writes or deletes, and each list it places a row in or takes one out
 * of, with that list's rows, so the list reads as it did if the request fails.
 */
const keepPending = (
  walk: ReturnType<typeof reacher>,
  optimistic: OptimisticState,
  pending: ReadonlySet<string>,
): void => {
  for (const layer of optimistic.layers) {
    if (!pending.has(layer.id)) continue
    for (const patch of layer.patches) walk.add(entityKey(patch.entity, patch.id))
    // A failure brings the row back, as it was.
    for (const gone of layer.deletes) walk.add(entityKey(gone.entity, gone.id))
  }
  for (const overlay of optimistic.overlays) {
    if (!pending.has(overlay.id)) continue
    walk.list({ identity: overlay.connection })
    for (const edge of overlay.edges) walk.add(entityKey(edge.ref.entity, edge.ref.id))
  }
}

/**
 * The entity keys the roots reach, what a pending request changes, and the
 * edges of each settled overlay on a list the roots keep.
 */
export const reachable = (
  store: EntityStore,
  roots: RetentionRoots,
  connections: Readonly<Record<string, Connection>>,
  optimistic: OptimisticState,
  pending: ReadonlySet<string>,
): ReadonlySet<EntityKey> => {
  const walk = reacher(store, connections)
  roots.requirements.forEach(walk.read)
  roots.connections.forEach(walk.list)
  keepPending(walk, optimistic, pending)
  // A settled overlay (a live or confirmed insert) is kept only with a retained connection.
  const rootConnections = new Set(roots.connections.map(root => root.identity))
  for (const overlay of optimistic.overlays) {
    if (pending.has(overlay.id) || !rootConnections.has(overlay.connection)) continue
    for (const edge of overlay.edges) walk.add(entityKey(edge.ref.entity, edge.ref.id))
  }
  return walk.kept
}

/**
 * What retention holds: the active Surfaces' roots, and those of Surfaces
 * left, in the batches they left in, oldest first. A page left takes its
 * lists and reads together, so they are one batch.
 */
export interface RecentRoots {
  readonly active: RetentionRoots
  readonly departed: ReadonlyArray<RetentionRoots>
}

const noRoots: RetentionRoots = { requirements: [], connections: [] }
export const noRecentRoots: RecentRoots = { active: noRoots, departed: [] }

/**
 * How many entries retention keeps when `Remote.make` is given no `budget`:
 * each row and each list the store holds is one.
 */
export const defaultBudget = 1_000

/** Every root `recent` holds: the departed, oldest first, then the active. */
export const heldRoots = (recent: RecentRoots): RetentionRoots => ({
  requirements: [
    ...recent.departed.flatMap(batch => batch.requirements),
    ...recent.active.requirements,
  ],
  connections: [
    ...recent.departed.flatMap(batch => batch.connections),
    ...recent.active.connections,
  ],
})

const requirementKey = (requirement: Requirement): string => JSON.stringify(requirement)
const connectionKey = (root: ConnectionRoot): string => JSON.stringify(root)

/** `roots` without the reads in `reads` and the lists in `lists`, by identity. */
const without = (
  roots: RetentionRoots,
  reads: ReadonlySet<string>,
  lists: ReadonlySet<string>,
): RetentionRoots => ({
  requirements: roots.requirements.filter(root => !reads.has(requirementKey(root))),
  connections: roots.connections.filter(root => !lists.has(root.identity)),
})

const sameRoots = (a: RetentionRoots, b: RetentionRoots): boolean =>
  a.requirements.length === b.requirements.length &&
  a.connections.length === b.connections.length &&
  a.requirements.every((root, i) => requirementKey(root) === requirementKey(b.requirements[i]!)) &&
  a.connections.every((root, i) => connectionKey(root) === connectionKey(b.connections[i]!))

/**
 * The roots retention keeps once `active` are the active Surfaces' roots, and
 * those the budget evicts.
 *
 * The active roots, and the rows a pending request touches, are always kept,
 * past the budget if they must be. The roots `previous.active` held that
 * `active` does not leave as a batch of their own, after every earlier one;
 * a root that is active again leaves its batch. Batches are then admitted
 * newest first while the entries they add fit `budget`: each row not held
 * before, each list, and at least one for a read whose row is held already,
 * so the roots kept stay bounded too. The first batch that does not fit is
 * evicted with every older one. `previous` itself when nothing changed.
 */
export const budgeted = (
  previous: RecentRoots,
  active: RetentionRoots,
  state: Retained & { readonly mutations: MutationState },
  budget: number,
): { readonly recent: RecentRoots; readonly evicted: RetentionRoots } => {
  const reads = new Set(active.requirements.map(requirementKey))
  const lists = new Set(active.connections.map(root => root.identity))
  const batches = [...previous.departed, previous.active]
    .map(batch => without(batch, reads, lists))
    .filter(batch => batch.requirements.length > 0 || batch.connections.length > 0)

  const walk = reacher(state.entities, state.connections)
  keepPending(walk, state.optimistic, state.mutations.pending)
  active.requirements.forEach(walk.read)
  active.connections.forEach(walk.list)
  let spent = walk.held() + active.connections.length
  let oldestKept = batches.length
  for (let at = batches.length - 1; at >= 0; at--) {
    const batch = batches[at]!
    let cost = batch.connections.length
    for (const root of batch.requirements) {
      const before = walk.held()
      walk.read(root)
      cost += Math.max(1, walk.held() - before)
    }
    for (const root of batch.connections) {
      const before = walk.held()
      walk.list(root)
      cost += walk.held() - before
    }
    if (spent + cost > budget) break
    spent += cost
    oldestKept = at
  }

  const departed = batches.slice(oldestKept)
  const evicted = batches.slice(0, oldestKept)
  const unchanged =
    sameRoots(previous.active, active) &&
    previous.departed.length === departed.length &&
    previous.departed.every((batch, i) => sameRoots(batch, departed[i]!))
  return {
    recent: unchanged ? previous : { active, departed },
    evicted: {
      requirements: evicted.flatMap(batch => batch.requirements),
      connections: evicted.flatMap(batch => batch.connections),
    },
  }
}

/**
 * Drops every entity the roots do not reach, every connection they do not
 * name, and every settled overlay on a dropped connection, keeping whatever a
 * pending request's layer or overlays touch. Pure.
 */
export const gc = (
  state: Retained & { readonly mutations: MutationState },
  roots: RetentionRoots,
): Retained => {
  const pending = state.mutations.pending
  const kept = reachable(state.entities, roots, state.connections, state.optimistic, pending)
  const entities = keptOf(state.entities, key => kept.has(key))
  const keptConnections = new Set([
    ...roots.connections.map(root => root.identity),
    ...state.optimistic.overlays
      .filter(overlay => pending.has(overlay.id))
      .map(overlay => overlay.connection),
  ])
  const connections = keptOf(state.connections, identity => keptConnections.has(identity))
  const overlays = state.optimistic.overlays.filter(
    overlay => pending.has(overlay.id) || keptConnections.has(overlay.connection),
  )
  const optimistic: OptimisticState =
    overlays.length === state.optimistic.overlays.length
      ? state.optimistic
      : { layers: state.optimistic.layers, overlays }
  return { entities, connections, optimistic }
}

/** The entries whose key is kept; `record` itself when that is all of them. */
const keptOf = <T>(
  record: Readonly<Record<string, T>>,
  keep: (key: string) => boolean,
): Readonly<Record<string, T>> => {
  const entries = Object.entries(record)
  const kept = entries.filter(([key]) => keep(key))
  return kept.length === entries.length ? record : Object.fromEntries(kept)
}
