/**
 * What of Remote's state crosses from a server render to the browser.
 *
 * A page rendered a moment ago sends exactly what its active Surfaces read:
 * for each requirement the fields it names, following relations through the
 * refs the store holds, and each connection whole, with its boundaries, so
 * "load more" knows where the server stopped. A live subscription's cursor
 * crosses with the entities it covers, so a subscription started in the
 * browser resumes where the server's left off.
 *
 * This is not a `Snapshot`, which is built for a cache that survived a reload
 * and deliberately keeps no cursors. Nothing else of `RemoteModel` crosses:
 * loading marks, failures, the mutation ledger, optimistic layers, gaps and
 * retention start from their initial values in the browser.
 */
import { Result, Schema } from 'effect'
import type { Metadata, ModelRef } from 'foldkit-surface'
import type { Boundary, Connection, Segment } from './connection.js'
import type { LiveState } from './live.js'
import type { RemoteModel } from './model.js'
import { targetsOf } from './relation.js'
import { RemoteConnections, RemoteRequirements, type RelationRequirement } from './requirement.js'
import { entityKey, readField, type EntityEntry } from './store.js'

const CapturedEntry = Schema.Struct({
  values: Schema.Record(Schema.String, Schema.Unknown),
  present: Schema.Array(Schema.String),
  stale: Schema.Array(Schema.String),
  unavailable: Schema.Array(Schema.String),
  windows: Schema.Record(Schema.String, Schema.String),
  tombstone: Schema.Boolean,
  updatedAt: Schema.Number,
})

const CapturedBoundary = Schema.Union([
  Schema.TaggedStruct('Terminal', {}),
  Schema.TaggedStruct('Cursor', { cursor: Schema.String }),
  Schema.TaggedStruct('Unknown', {}),
])

const CapturedConnection = Schema.Struct({
  segments: Schema.Array(
    Schema.Struct({
      edges: Schema.Array(
        Schema.Struct({
          key: Schema.String,
          ref: Schema.Struct({ entity: Schema.String, id: Schema.String }),
        }),
      ),
      start: CapturedBoundary,
      end: CapturedBoundary,
    }),
  ),
  stale: Schema.Boolean,
})

const CapturedLive = Schema.Struct({
  cursor: Schema.Number,
  boundary: Schema.Record(
    Schema.String,
    Schema.Struct({ before: Schema.Number, after: Schema.Number }),
  ),
})

/**
 * Marks a Subscription entry Remote built as one that may start late under
 * `foldkit-ssr`'s deferred boot (its decision 10): a read with resumed data
 * plans nothing, a live subscription resumes from the cursor the envelope
 * carries, and retention running late collects late. Non-enumerable, so the
 * runtime's iteration of an entry never sees it.
 */
export const DEFERRABLE: unique symbol = Symbol.for('foldkit-remote/deferrable')

/** Marks every entry of a record Remote built, lifted or not. */
export const markAll = <Entries extends object>(entries: Entries): Entries => {
  for (const entry of Object.values(entries)) {
    Object.defineProperty(entry, DEFERRABLE, { value: true, enumerable: false })
  }
  return entries
}

/** The captured part of a Remote store, as JSON. */
export const RemoteCapture = Schema.Struct({
  entities: Schema.Record(Schema.String, CapturedEntry),
  connections: Schema.Record(Schema.String, CapturedConnection),
  live: Schema.Record(Schema.String, CapturedLive),
})
export type RemoteCapture = typeof RemoteCapture.Type

type MutableEntry = {
  values: Record<string, unknown>
  present: Set<string>
  stale: Set<string>
  unavailable: Set<string>
  windows: Record<string, string>
  tombstone: boolean
  updatedAt: number
}

/** What some projections read, from their metadata. */
const askedOf = (projections: ReadonlyArray<{ readonly metadata: Metadata }>) => ({
  requirements: projections.flatMap(projection => RemoteRequirements.get(projection.metadata)),
  connections: projections.flatMap(projection => RemoteConnections.get(projection.metadata)),
})

/** Whether every `entity:id:fields` part of a live stream key was captured with those fields. */
const liveCovered = (stream: string, entries: ReadonlyMap<string, MutableEntry>): boolean =>
  stream.split('|').every(part => {
    const split = part.lastIndexOf(':')
    const entry = entries.get(part.slice(0, split))
    const fields = part
      .slice(split + 1)
      .split(',')
      .filter(field => field !== '')
    return entry !== undefined && fields.every(field => entry.present.has(field))
  })

/**
 * Captures what some projections read from a store: the fields each
 * requirement names, through its relations; each connection whole, and the
 * fields its selection reads of each item; and each live cursor whose
 * entities were all captured with the fields it follows.
 */
export const captureRemote = (
  remote: RemoteModel,
  projections: ReadonlyArray<{ readonly metadata: Metadata }>,
): RemoteCapture => {
  const store = remote.entities
  const entries = new Map<string, MutableEntry>()
  const walked = new Map<string, Set<RelationRequirement>>()

  const walk = (entity: string, id: string, requirement: RelationRequirement): void => {
    const key = entityKey(entity, id)
    const seen = walked.get(key) ?? new Set()
    if (seen.has(requirement)) return
    seen.add(requirement)
    walked.set(key, seen)
    const stored: EntityEntry | undefined = store[key]
    if (stored === undefined) return
    const entry = entries.get(key) ?? {
      values: {},
      present: new Set<string>(),
      stale: new Set<string>(),
      unavailable: new Set<string>(),
      windows: {},
      tombstone: stored.tombstone,
      updatedAt: stored.updatedAt,
    }
    entries.set(key, entry)
    for (const field of requirement.fields) {
      // A field the server settled without a value is knowledge too: the
      // browser would otherwise ask for it once more.
      if (stored.unavailable.has(field)) entry.unavailable.add(field)
      if (!stored.present.has(field)) continue
      entry.values[field] = stored.values[field]
      entry.present.add(field)
      if (stored.stale.has(field)) entry.stale.add(field)
      const window = stored.windows[field]
      if (window !== undefined) entry.windows[field] = window
      const nested = requirement.relations?.[field]
      if (nested === undefined) continue
      const value = readField(store, key, field)
      if (value._tag === 'None') continue
      for (const ref of targetsOf(value.value, nested)) walk(ref.entity, ref.id, nested)
    }
  }

  const asked = askedOf(projections)
  for (const requirement of asked.requirements) {
    walk(requirement.entity, requirement.id, requirement)
  }
  const connections: Record<string, Connection> = {}
  for (const { identity, select } of asked.connections) {
    const connection = remote.connections[identity]
    if (connection === undefined) continue
    connections[identity] = connection
    for (const segment of connection.segments) {
      for (const edge of segment.edges) walk(edge.ref.entity, edge.ref.id, select)
    }
  }
  const live: Record<string, LiveState> = {}
  for (const [stream, state] of Object.entries(remote.live)) {
    if (liveCovered(stream, entries)) live[stream] = state
  }

  return {
    entities: Object.fromEntries(
      [...entries].map(([key, entry]) => [
        key,
        {
          values: entry.values,
          present: [...entry.present],
          stale: [...entry.stale],
          unavailable: [...entry.unavailable],
          windows: entry.windows,
          tombstone: entry.tombstone,
          updatedAt: entry.updatedAt,
        },
      ]),
    ),
    connections: Object.fromEntries(
      Object.entries(connections).map(([identity, connection]) => [
        identity,
        {
          segments: connection.segments.map(segment => ({
            edges: segment.edges.map(edge => ({ key: edge.key, ref: edge.ref })),
            start: segment.start,
            end: segment.end,
          })),
          stale: connection.stale,
        },
      ]),
    ),
    live,
  }
}

/**
 * Sets a capture onto a store: its entities, connections and live cursors
 * replace any held under the same keys, and nothing else of the store changes.
 */
export const restoreRemote = <Store extends RemoteModel>(
  remote: Store,
  capture: RemoteCapture,
): Store => ({
  ...remote,
  entities: {
    ...remote.entities,
    ...Object.fromEntries(
      Object.entries(capture.entities).map(([key, entry]) => [
        key,
        {
          values: entry.values,
          present: new Set(entry.present),
          stale: new Set(entry.stale),
          unavailable: new Set(entry.unavailable),
          windows: entry.windows,
          tombstone: entry.tombstone,
          updatedAt: entry.updatedAt,
        } satisfies EntityEntry,
      ]),
    ),
  },
  connections: {
    ...remote.connections,
    ...Object.fromEntries(
      Object.entries(capture.connections).map(([identity, connection]) => [
        identity,
        {
          segments: connection.segments.map((segment): Segment => ({
            edges: segment.edges,
            start: segment.start as Boundary,
            end: segment.end as Boundary,
          })),
          stale: connection.stale,
        } satisfies Connection,
      ]),
    ),
  },
  live: { ...remote.live, ...capture.live },
})

/**
 * A resume part, in the shape `foldkit-ssr`'s `SSR.plan` takes in `parts`.
 * Declared here structurally, so neither package depends on the other.
 */
export interface RemoteResumePart<AppModel> {
  readonly id: string
  /** The metadata key names whose reads this part resumes. */
  readonly covers: ReadonlyArray<string>
  readonly capture: (
    model: AppModel,
    projections: ReadonlyArray<{ readonly metadata: Metadata }>,
  ) => unknown
  readonly restore: (model: AppModel, value: unknown) => Result.Result<AppModel, string>
  /** Whether a Subscription entry is one of this domain's, which may start late. */
  readonly deferrable: (key: string, entry: unknown) => boolean
}

const encodeCapture = Schema.encodeSync(RemoteCapture)
const decodeCapture = Schema.decodeUnknownResult(RemoteCapture)

/**
 * The resume part for a Remote domain, for `SSR.plan`'s `parts`: it sends
 * what the plan's active Surfaces read from this domain's store, and nothing
 * else of it. `id` tells two domains in one application apart.
 */
export const resumePart = <AppModel, Store extends RemoteModel>(
  domain: { readonly store: ModelRef<AppModel, Store> },
  options: { readonly id?: string | undefined } = {},
): RemoteResumePart<AppModel> => ({
  id: options.id ?? 'remote',
  covers: [RemoteRequirements.name, RemoteConnections.name],
  deferrable: (_key, entry) => typeof entry === 'object' && entry !== null && DEFERRABLE in entry,
  capture: (model, projections) =>
    encodeCapture(captureRemote(domain.store.get(model), projections)),
  restore: (model, value) =>
    Result.match(decodeCapture(value), {
      onFailure: error => Result.fail(`Remote's state does not decode: ${error.message}`),
      onSuccess: capture =>
        Result.succeed(domain.store.set(model, restoreRemote(domain.store.get(model), capture))),
    }),
})
