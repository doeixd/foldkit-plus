/**
 * The fields a newer server value moved while a write was pending: a live
 * patch, or a read answered beside the write. The newer value writes the base,
 * so the server's newest word is always there. For a patch the record holds
 * what the field held before it, and a relative layer (`adds`, `computes`)
 * resolves over that instead, or its own echo would be counted twice (#498).
 * The record also tells an answer which fields moved while its request was
 * pending, to be read again where the answer disagrees (#499, #480). Every
 * domain with writes keeps it, through the layer capability, whether or not it
 * reads live.
 */
import { Equal, Option } from 'effect'
import { own, put } from './record.js'
import { entityKey, type EntityEntry, type EntityKey, type EntityStore } from './store.js'

export interface KeptField {
  /**
   * The requests pending when a newer value wrote the field, each with the
   * base's value from before the newest such value it was pending beside (none
   * when the row did not hold the field): a request started after one cannot
   * be echoed by it. Their answers are compared with what was written.
   */
  readonly by: ReadonlyMap<string, Option.Option<unknown>>
  /** When the first newer value was heard: a kept value older than the bound is dropped. */
  readonly since: number
}

export type Kept = ReadonlyMap<EntityKey, ReadonlyMap<string, KeptField>>

export const noKept: Kept = new Map()

/** Long past any stream's lag behind an answer: it only bounds what the Model keeps (echoes and `kept` alike). */
export const echoKept = 60_000

interface Row {
  readonly entity: string
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
}

/** `values` with each field `id` was pending beside a newer value of, as it was before it. */
export const overKept = (
  values: Readonly<Record<string, unknown>>,
  kept: ReadonlyMap<string, KeptField> | undefined,
  id: string,
): Readonly<Record<string, unknown>> => {
  if (kept === undefined) return values
  const next: Record<string, unknown> = { ...values }
  for (const [field, { by }] of kept) {
    const before = by.get(id)
    if (before === undefined) continue
    if (Option.isSome(before)) put(next, field, before.value)
    else delete next[field]
  }
  return next
}

/** `kept` without the fields heard `echoKept` or more before `now`. */
export const unexpired = (kept: Kept, now: number): Kept => {
  let next: Map<EntityKey, ReadonlyMap<string, KeptField>> | undefined
  for (const [key, row] of kept) {
    const live = new Map([...row].filter(([, field]) => field.since > now - echoKept))
    if (live.size === row.size) continue
    next ??= new Map(kept)
    if (live.size === 0) next.delete(key)
    else next.set(key, live)
  }
  return next ?? kept
}

/** What a row held as `under` holds of `field`: none when it is gone or never held it. */
export const heldOf =
  (under: EntityEntry | undefined) =>
  (field: string): Option.Option<unknown> =>
    under !== undefined && !under.tombstone && under.present.has(field)
      ? Option.some(own(under.values, field))
      : Option.none()

/**
 * `kept` once a newer value wrote `fields` of a row, while the requests in
 * `pending` were in flight: a field's first newer value keeps `valueOf` it,
 * and every one adds the requests it was pending beside.
 */
export const keptBefore = (
  kept: Kept,
  key: EntityKey,
  valueOf: (field: string) => Option.Option<unknown>,
  fields: ReadonlyArray<string>,
  pending: ReadonlySet<string>,
  now: number,
): Kept => {
  const row = new Map(kept.get(key))
  let changed = false
  for (const field of fields) {
    const held = row.get(field)
    const before = valueOf(field)
    // A request new to the field began after the values it already has, so it is
    // worked out over what the base held before this one.
    const fresh = [...pending].filter(id => held === undefined || !held.by.has(id))
    if (fresh.length === 0) continue
    changed = true
    row.set(field, {
      since: held?.since ?? now,
      by: new Map([...(held?.by ?? []), ...fresh.map(id => [id, before] as const)]),
    })
  }
  return changed ? new Map(kept).set(key, row) : kept
}

/**
 * `kept` once a read is about to write `rows` over `store`, less those it
 * `held`, while the requests in `pending` are in flight. A field the read moves
 * is kept, so the answer reads it again if it disagrees: the read may be past
 * a write whose answer is still on its way, and nothing else sends the value
 * again (#480). It keeps the read's own value, not the one it replaced: a
 * relative layer then resolves over the newest value the server sent, which a
 * read, unlike a patch, is not more likely to be this write's echo than not.
 */
export const keepRead = (
  kept: Kept,
  store: EntityStore,
  rows: ReadonlyArray<Row>,
  held: ReadonlySet<EntityKey>,
  pending: ReadonlySet<string>,
  now: number,
): Kept => {
  if (pending.size === 0) return kept
  for (const { entity, id, values } of rows) {
    const key = entityKey(entity, id)
    if (held.has(key)) continue
    const moved = Object.keys(values).filter(
      field => !Equal.equals(own(store[key]?.values, field), values[field]),
    )
    kept = keptBefore(kept, key, field => Option.some(values[field]), moved, pending, now)
  }
  return kept
}

/**
 * What an answer does to the values kept: the fields it writes leave `kept`,
 * and those that a patch or a read moved while the request was pending, to
 * something other than the answer's value, are `again` to be read: the client
 * cannot tell whether that value is behind the write or past it, and only a
 * read can say (#499, #480). `pending` is the requests still in flight after
 * the answer; with none, nothing is kept.
 */
export const settleKept = (
  kept: Kept,
  store: EntityStore,
  requestId: string,
  entities: ReadonlyArray<Row>,
  pending: ReadonlySet<string>,
  now: number,
): { readonly kept: Kept; readonly again: ReadonlyArray<AgainRow> } => {
  const held = unexpired(kept, now)
  const again = againOf(held, store, requestId, entities)
  if (pending.size === 0) return { kept: noKept, again }
  const next = new Map(held)
  for (const { entity, id, values } of entities) {
    const key = entityKey(entity, id)
    const row = next.get(key)
    if (row === undefined) continue
    const rest = new Map([...row].filter(([field]) => !Object.hasOwn(values, field)))
    if (rest.size === 0) next.delete(key)
    else next.set(key, rest)
  }
  return { kept: next, again }
}

export interface AgainRow {
  readonly entity: string
  readonly id: string
  readonly fields: ReadonlyArray<string>
}

const againOf = (
  kept: Kept,
  store: EntityStore,
  requestId: string,
  entities: ReadonlyArray<Row>,
): ReadonlyArray<AgainRow> => {
  const again = new Map<EntityKey, { entity: string; id: string; fields: Set<string> }>()
  for (const { entity, id, values } of entities) {
    const key = entityKey(entity, id)
    const row = kept.get(key)
    if (row === undefined) continue
    for (const [field, held] of row) {
      if (!held.by.has(requestId) || !Object.hasOwn(values, field)) continue
      if (Equal.equals(own(store[key]?.values, field), values[field])) continue
      const asked = again.get(key) ?? { entity, id, fields: new Set<string>() }
      asked.fields.add(field)
      again.set(key, asked)
    }
  }
  return [...again.values()].map(({ entity, id, fields }) => ({ entity, id, fields: [...fields] }))
}
