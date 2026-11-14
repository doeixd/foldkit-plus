/**
 * The pure entity store: values, per-field presence, staleness, and tombstones.
 *
 * Presence is tracked **separately** from values, so `undefined`/`null`/absent/
 * stale/not-found are distinct states and a missing field is never inferred from
 * `value === undefined`. Nothing here performs I/O or mutates its input; an
 * operation that changes nothing returns the store it was given.
 */
import { Option } from 'effect'
import { sameData } from './data.js'
import { own, put } from './record.js'
import { RELATION_ALIAS } from './relation.js'

export type EntityKey = string

export interface EntityEntry {
  readonly values: Readonly<Record<string, unknown>>
  readonly present: ReadonlySet<string>
  /**
   * Present fields whose value may be outdated (revalidation needed). On a
   * tombstone, the fields it is being asked about again (`askAgain`).
   */
  readonly stale: ReadonlySet<string>
  /**
   * Fields the server settled without a value: asked for, and answered without
   * them, whatever the reason. Not planned again until a refresh asks; a later
   * write of the field clears it.
   */
  readonly unavailable: ReadonlySet<string>
  /** The entity is known to be absent; a later write clears this. */
  readonly tombstone: boolean
  /**
   * Injected clock reading of the newest write; never read from ambient state.
   * Order reads it: whether the row was read after a write.
   */
  readonly updatedAt: number
  /**
   * No later than the oldest held field's write: the date of any field `fieldAt`
   * does not name. A write of every held field sets it; a write of some leaves
   * it, so a field is read again early at most, never late.
   */
  readonly oldestAt: number
  /**
   * The write date of each field written since the row was last written whole.
   * Freshness reads the fields a read asks, so a re-read of those dates them
   * though the row holds others. Not persisted or resumed: a restored row reads
   * every field as `oldestAt`.
   */
  readonly fieldAt?: Readonly<Record<string, number>> | undefined
  /**
   * The canonical window each present field was fetched with (`""` for none).
   * A later request with a *known, different* window is planned as missing.
   */
  readonly windows: Readonly<Record<string, string>>
  /**
   * The row's revision, as the server last sent it: a write of a lower one
   * is dropped (`writeEntities`). Absent while no answer carried one.
   */
  readonly revision?: number | undefined
  /**
   * The read-after token of the newest write to the row whose read no answer
   * has confirmed (`MutationResult.after`): a read of the row is planned while
   * it is set, carries it, and writes nothing until an answer read at it.
   */
  readonly floor?: string | undefined
}

export type EntityStore = Readonly<Record<EntityKey, EntityEntry>>

/**
 * The separator keeps an untrusted id from colliding with a prototype key. An
 * entity name is escaped first, so its own `:` cannot be read as that
 * separator and two entities cannot share a key (#454); a name without one
 * leaves the key as it was.
 */
export const entityKey = (entity: string, id: string): EntityKey =>
  `${entity.replaceAll('%', '%25').replaceAll(':', '%3A')}:${id}`

const emptyEntry: EntityEntry = {
  values: {},
  present: new Set(),
  stale: new Set(),
  unavailable: new Set(),
  tombstone: false,
  updatedAt: 0,
  oldestAt: 0,
  windows: {},
}

export const emptyStore: EntityStore = {}

const replace = (store: EntityStore, key: EntityKey, entry: EntityEntry): EntityStore => ({
  ...store,
  [key]: entry,
})

const written = (
  previous: EntityEntry,
  values: Readonly<Record<string, unknown>>,
  now: number,
  windows?: Readonly<Record<string, string>>,
  kept?: number,
  revision?: number,
): EntityEntry => {
  const present = new Set(previous.present)
  const stale = new Set(previous.stale)
  const unavailable = new Set(previous.unavailable)
  const nextWindows: Record<string, string> = { ...previous.windows }
  for (const field of Object.keys(values)) {
    present.add(field)
    stale.delete(field)
    unavailable.delete(field)
    // A write without a window clears any remembered one: the value changed.
    const requested = own(windows, field)
    if (requested !== undefined && requested !== '') put(nextWindows, field, requested)
    else delete nextWindows[field]
    // The whole list changed, so a page of it read under an alias may have too.
    if (!field.includes(RELATION_ALIAS))
      for (const held of present)
        if (held.startsWith(`${field}${RELATION_ALIAS}`) && !(held in values)) stale.add(held)
  }
  // Every held field written again (a whole-row read, as expiry plans, or a first
  // write, a tombstone holding none) dates the row anew.
  const whole = [...previous.present].every(field => Object.hasOwn(values, field))
  // An overlay keeps the dates of the row under it, a whole write drops them (every
  // field is `oldestAt`), and a partial write dates the fields it wrote.
  let fieldAt = kept === undefined ? undefined : previous.fieldAt
  if (kept === undefined && !whole) {
    const dated: Record<string, number> = { ...previous.fieldAt }
    for (const field of Object.keys(values)) put(dated, field, now)
    fieldAt = dated
  }
  return {
    // Equal data keeps the object it was, so what is derived from it by
    // identity (a read's decoded row) survives a refetch that changed nothing.
    // Comparing costs the size of the written data, less than decoding it again.
    values: Object.keys(values).every(
      field =>
        Object.hasOwn(previous.values, field) && sameData(previous.values[field], values[field]),
    )
      ? previous.values
      : { ...previous.values, ...values },
    present,
    stale,
    unavailable,
    tombstone: false,
    updatedAt: now,
    oldestAt: kept ?? (whole ? now : Math.min(previous.oldestAt, now)),
    fieldAt,
    windows: nextWindows,
    ...(previous.floor === undefined ? {} : { floor: previous.floor }),
    ...(revision === undefined ? {} : { revision }),
  }
}

/** The date of the oldest of `fields` the entry holds, or of its oldest field when it holds none of them. */
export const oldestOf = (entry: EntityEntry, fields: Iterable<string>): number => {
  let oldest = Infinity
  for (const field of fields)
    if (entry.present.has(field) || entry.unavailable.has(field))
      oldest = Math.min(oldest, own(entry.fieldAt, field) ?? entry.oldestAt)
  return oldest === Infinity ? entry.oldestAt : oldest
}

export interface EntityWrite {
  readonly key: EntityKey
  readonly values: Readonly<Record<string, unknown>>
  /** The canonical window each written relation field was fetched with. */
  readonly windows?: Readonly<Record<string, string>> | undefined
  /** When this write dates the entity, instead of the batch's `now`. */
  readonly updatedAt?: number | undefined
  /** The row's freshness to keep, instead of what the write would make it (an overlay's). */
  readonly oldestAt?: number | undefined
  /** The row's revision, as the server sent it with these values. */
  readonly revision?: number | undefined
}

/**
 * Whether a write of `revision` is older than the row the store holds: the
 * server sent a newer revision of it already. A write or a row with no
 * revision is never older.
 */
export const olderThanHeld = (
  held: EntityEntry | undefined,
  revision: number | undefined,
): boolean => revision !== undefined && held?.revision !== undefined && revision < held.revision

/**
 * Merges known values into many entities, copying the store once. Every
 * written field becomes present and non-stale; a tombstone is cleared because
 * the entity is evidently not absent.
 */
export const writeEntities = (
  store: EntityStore,
  writes: ReadonlyArray<EntityWrite>,
  now = 0,
): EntityStore => {
  if (writes.length === 0) return store
  let next: Record<EntityKey, EntityEntry> | undefined
  for (const write of writes) {
    const held = (next ?? store)[write.key]
    if (olderThanHeld(held, write.revision)) continue
    next ??= { ...store }
    next[write.key] = written(
      held ?? emptyEntry,
      write.values,
      write.updatedAt ?? now,
      write.windows,
      write.oldestAt,
      write.revision ?? held?.revision,
    )
  }
  return next ?? store
}

/** `writeEntities` for one entity. */
export const writeEntity = (
  store: EntityStore,
  key: EntityKey,
  values: Readonly<Record<string, unknown>>,
  now = 0,
  windows?: Readonly<Record<string, string>>,
): EntityStore => writeEntities(store, [{ key, values, windows }], now)

/**
 * Marks present fields stale (`true`) or ends their staleness (`false`) across
 * many entities, copying the store once. A field never present stays missing;
 * an unknown entity is left alone.
 */
export const setStale = (
  store: EntityStore,
  marks: ReadonlyArray<readonly [key: EntityKey, fields: Iterable<string>]>,
  stale: boolean,
): EntityStore => {
  let next: Record<EntityKey, EntityEntry> | undefined
  for (const [key, fields] of marks) {
    const previous = (next ?? store)[key]
    if (previous === undefined) continue
    const staleFields = new Set(previous.stale)
    for (const field of fields) {
      if (stale) {
        if (previous.present.has(field)) staleFields.add(field)
      } else staleFields.delete(field)
    }
    // Only ever added to or only ever removed from, so an equal size is the same set.
    if (staleFields.size === previous.stale.size) continue
    next ??= { ...store }
    next[key] = { ...previous, stale: staleFields }
  }
  return next ?? store
}

/** Marks present fields stale; fields that were never present stay missing. */
export const markStale = (
  store: EntityStore,
  key: EntityKey,
  fields: Iterable<string>,
): EntityStore => setStale(store, [[key, fields]], true)

/** Ends a refresh that did not land: the fields are present again as they were. */
export const clearStale = (
  store: EntityStore,
  key: EntityKey,
  fields: Iterable<string>,
): EntityStore => setStale(store, [[key, fields]], false)

/**
 * Records fields the server settled without a value. A present field is left
 * as it is: the answer that settled it was not about the value it holds.
 * `false` forgets the marks, which is how a refresh asks again.
 */
export const setUnavailable = (
  store: EntityStore,
  marks: ReadonlyArray<readonly [key: EntityKey, fields: Iterable<string>]>,
  unavailable: boolean,
): EntityStore => {
  let next: Record<EntityKey, EntityEntry> | undefined
  for (const [key, fields] of marks) {
    const previous = (next ?? store)[key] ?? emptyEntry
    if (previous.tombstone) continue
    const marked = new Set(previous.unavailable)
    for (const field of fields) {
      if (unavailable) {
        if (!previous.present.has(field)) marked.add(field)
      } else marked.delete(field)
    }
    if (marked.size === previous.unavailable.size) continue
    next ??= { ...store }
    next[key] = { ...previous, unavailable: marked }
  }
  return next ?? store
}

/** Whether the server settled this field without a value, and nothing has written it since. */
export const isFieldUnavailable = (store: EntityStore, key: EntityKey, field: string): boolean => {
  const value = store[key]
  return value !== undefined && !value.tombstone && value.unavailable.has(field)
}

/**
 * Records that the entity is known to be absent, so it is not refetched. On a
 * tombstone being asked about again, the answer: still absent, so the asking ends.
 */
export const tombstone = (store: EntityStore, key: EntityKey): EntityStore =>
  isTombstone(store, key) && store[key]!.stale.size === 0
    ? store
    : replace(store, key, {
        values: {},
        present: new Set(),
        stale: new Set(),
        unavailable: new Set(),
        tombstone: true,
        updatedAt: 0,
        oldestAt: 0,
        windows: {},
      })

/**
 * Asks about tombstoned entities again: each stays absent, so a list keeps
 * hiding it and a read of it keeps `NotFound`, while `missingFields` plans the
 * fields asked for. A write clears the tombstone; `tombstone` ends the asking.
 * An entity that is not a tombstone is left alone.
 */
export const askAgain = (
  store: EntityStore,
  marks: ReadonlyArray<readonly [key: EntityKey, fields: Iterable<string>]>,
): EntityStore => {
  let next: Record<EntityKey, EntityEntry> | undefined
  for (const [key, fields] of marks) {
    const previous = (next ?? store)[key]
    if (previous === undefined || !previous.tombstone) continue
    const asked = new Set([...previous.stale, ...fields])
    if (asked.size === previous.stale.size) continue
    next ??= { ...store }
    next[key] = { ...previous, stale: asked }
  }
  return next ?? store
}

/**
 * Holds each row to a read-after token: it keeps what the store holds of it
 * until a read at the token answers. A row the store does not hold gets an
 * entry holding only the token.
 */
export const setFloors = (
  store: EntityStore,
  floors: ReadonlyArray<{ readonly key: EntityKey; readonly token: string }>,
): EntityStore => {
  let next: Record<EntityKey, EntityEntry> | undefined
  for (const { key, token } of floors) {
    const held = (next ?? store)[key] ?? emptyEntry
    if (held.floor === token) continue
    next ??= { ...store }
    next[key] = { ...held, floor: token }
  }
  return next ?? store
}

/** Ends each row's read-after token: a read answered at it. */
export const clearFloors = (store: EntityStore, keys: Iterable<EntityKey>): EntityStore => {
  let next: Record<EntityKey, EntityEntry> | undefined
  for (const key of keys) {
    const held = (next ?? store)[key]
    if (held?.floor === undefined) continue
    next ??= { ...store }
    const { floor: _cleared, ...rest } = held
    next[key] = rest
  }
  return next ?? store
}

/** Forgets everything known about the entity, including a tombstone. */
export const remove = (store: EntityStore, key: EntityKey): EntityStore => {
  if (store[key] === undefined) return store
  const next = { ...store }
  delete next[key]
  return next
}

export const entry = (store: EntityStore, key: EntityKey): Option.Option<EntityEntry> => {
  const value = store[key]
  return value === undefined ? Option.none() : Option.some(value)
}

export const isTombstone = (store: EntityStore, key: EntityKey): boolean =>
  store[key]?.tombstone === true

/** A field is known only if it is present and not stale. */
export const hasField = (store: EntityStore, key: EntityKey, field: string): boolean => {
  const value = store[key]
  return (
    value !== undefined && !value.tombstone && value.present.has(field) && !value.stale.has(field)
  )
}

/** A present field whose value may be outdated; absent fields are not stale. */
export const isFieldStale = (store: EntityStore, key: EntityKey, field: string): boolean => {
  const value = store[key]
  return value !== undefined && !value.tombstone && value.stale.has(field)
}

/**
 * Reads a present field, stale or not. Absence and a tombstone both yield
 * `Option.none()`; a present `undefined`/`null` yields `Option.some`.
 */
export const readField = (
  store: EntityStore,
  key: EntityKey,
  field: string,
): Option.Option<unknown> => {
  const value = store[key]
  if (value === undefined || value.tombstone || !value.present.has(field)) return Option.none()
  return Option.some(value.values[field])
}

/**
 * The fields the planner must fetch. A tombstone makes every field known
 * (absent), so it returns only what it is asked about again, and a
 * field the server settled without a value is known the same way. A
 * requested window that differs from the one a field was fetched with also
 * marks it missing, but only when the stored window is known (never `""`), so a
 * writer that does not record windows cannot cause a refetch loop.
 */
export const missingFields = (
  store: EntityStore,
  key: EntityKey,
  fields: Iterable<string>,
  windows?: Readonly<Record<string, string>>,
): ReadonlyArray<string> => {
  const value = store[key]
  if (value !== undefined && value.tombstone) return [...fields].filter(f => value.stale.has(f))
  return [...fields].filter(field => {
    if (value === undefined) return true
    if (!value.present.has(field)) return !value.unavailable.has(field)
    if (value.stale.has(field)) return true
    const requested = own(windows, field)
    const stored = own(value.windows, field)
    return requested !== undefined && stored !== undefined && stored !== '' && stored !== requested
  })
}

/** How a snapshot meets a store that already has entries. */
export type MergePolicy = 'replace' | 'preserve-existing'

/**
 * Brings a snapshot into a store that may already hold entries. `replace`
 * takes the snapshot's entry for every key it has; `preserve-existing` keeps
 * an entry the current store already has (it is at least as fresh as a
 * snapshot taken earlier). Either way, keys only the current store has stay.
 */
export const mergeStores = (
  current: EntityStore,
  snapshot: EntityStore,
  policy: MergePolicy,
): EntityStore =>
  Object.keys(snapshot).length === 0
    ? current
    : policy === 'replace'
      ? { ...current, ...snapshot }
      : { ...snapshot, ...current }
