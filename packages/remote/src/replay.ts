/**
 * A pending write replayed over a newer server value: a live patch, or a read
 * answered beside the write, lands on a field the write moves while it is in
 * flight. The write's way of writing for that field decides, as metakit's
 * `writeProperties` says of it:
 * - one that commutes with any change to the field (an `add`) shows over what
 *   the field held, and replayed over the newer value gives the server's value
 *   after both, so an answer that is exactly that replay settles the field
 *   with no second read;
 * - one that does not (a `set`: an absolute value, a computed one, a link)
 *   shows its value over the newer one, and the two cannot be ordered from
 *   themselves, so an answer that disagrees reads the field again (#499,
 *   #480).
 * A failed write is dropped with its layer (`settleFailure`), and nothing is
 * read: the visible store is worked out again from the base, which is an
 * `add` undone over the current value and, under a `set`, the newer value
 * the failed write never changed.
 *
 * What is kept between the two is the record in `kept.ts`. Reached through
 * the layer capability, so a page loads this only where something makes a
 * layer, and apart from `kept.ts`, which every page's Model reads.
 */
import { Equal, Option } from 'effect'
import { writeProperties, type WayOfWriting } from 'metakit'
import { noKept, type Kept, type KeptField } from './kept.js'
import type { EntityLayer } from './optimistic.js'
import { own } from './record.js'
import { entityKey, type EntityKey, type EntityStore } from './store.js'

/** Long past any stream's lag behind an answer: it only bounds what the Model keeps (echoes and `kept` alike). */
export const echoKept = 60_000

export interface Row {
  readonly entity: string
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
}

/** A row's fields to read again. */
export interface AgainRow {
  readonly entity: string
  readonly id: string
  readonly fields: ReadonlyArray<string>
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

/**
 * `kept` once newer server values, `rows`, land over `store` while the
 * requests in `pending` are in flight. A patch may be a pending write's own
 * echo: every field it names is kept at what the store held before it (none
 * where the row did not hold it), so a relative layer resolving over that
 * does not count the write twice (#498). A read is no likelier an echo than
 * not: each field it moves is kept at its own value, so a relative layer
 * resolves over the newest value the server sent (#480). A request new to a
 * field began after the values it already has, and is kept over what the
 * store held before this one.
 */
export const replayOver = (
  kept: Kept,
  store: EntityStore,
  rows: ReadonlyArray<Row>,
  from: 'patch' | 'read',
  pending: ReadonlySet<string>,
  now: number,
): Kept => {
  let next = unexpired(kept, now)
  for (const { entity, id, values } of rows) {
    const key = entityKey(entity, id)
    const under = store[key]
    const held = (field: string): Option.Option<unknown> =>
      under !== undefined && !under.tombstone && under.present.has(field)
        ? Option.some(own(under.values, field))
        : Option.none()
    const fields =
      from === 'patch'
        ? Object.keys(values)
        : Object.keys(values).filter(
            field => !Equal.equals(own(under?.values, field), values[field]),
          )
    const row = new Map(next.get(key))
    let changed = false
    for (const field of fields) {
      const was = row.get(field)
      const fresh = [...pending].filter(id => was === undefined || !was.by.has(id))
      if (fresh.length === 0) continue
      changed = true
      const over = from === 'patch' ? held(field) : Option.some(values[field])
      row.set(field, {
        since: was?.since ?? now,
        by: new Map([...(was?.by ?? []), ...fresh.map(id => [id, over] as const)]),
      })
    }
    if (changed) next = new Map(next).set(key, row)
  }
  return next
}

/**
 * Whether a write of `way` replayed over any newer value of its path gives
 * the value after both: it commutes with another write of its way whatever
 * their values. Two `set`s commute only when they set one literal.
 */
const replays = (way: WayOfWriting): boolean => {
  const condition = writeProperties[way].commutes[way]
  return (
    condition !== undefined && condition !== 'same-literal' && condition !== 'different-literals'
  )
}

/**
 * `layer`'s write of `field` of row `key` (the last patch's, as it shows)
 * replayed over `newer`: an amount added to it, or the value set, absolute,
 * computed or a link. None where its way does not replay, or the value cannot
 * be worked out (a computed one, an amount over what is not a number).
 */
const replayed = (
  layer: EntityLayer | undefined,
  key: EntityKey,
  field: string,
  newer: unknown,
): Option.Option<unknown> => {
  const patch = [...(layer?.patches ?? [])]
    .reverse()
    .find(
      patch =>
        entityKey(patch.entity, patch.id) === key &&
        [patch.values, patch.adds ?? {}, patch.computes ?? {}].some(written =>
          Object.hasOwn(written, field),
        ),
    )
  if (patch === undefined) return Option.none()
  const amount = own(patch.adds, field)
  if (amount !== undefined)
    return replays('add') && typeof newer === 'number' ? Option.some(newer + amount) : Option.none()
  return replays('set') && Object.hasOwn(patch.values, field)
    ? Option.some(own(patch.values, field))
    : Option.none()
}

/**
 * What `requestId`'s answer, `entities`, does to the values kept, and what it
 * reads again. `layer` is the request's, and `pending` the requests still in
 * flight after it; with none, nothing is kept.
 *
 * The answer takes from `kept` the fields it writes. One a newer value moved
 * while the request was pending, to other than the answer's value, is read
 * again, unless the write's way replays and the answer is the write replayed
 * over that value: then the answer is the next value after it.
 */
export const settleReplayed = (
  kept: Kept,
  store: EntityStore,
  layer: EntityLayer | undefined,
  requestId: string,
  entities: ReadonlyArray<Row>,
  pending: ReadonlySet<string>,
  now: number,
): { readonly kept: Kept; readonly again: ReadonlyArray<AgainRow> } => {
  const held = unexpired(kept, now)
  const asked = new Map<EntityKey, { entity: string; id: string; fields: Set<string> }>()
  for (const { entity, id, values } of entities) {
    const key = entityKey(entity, id)
    for (const [field, { by }] of held.get(key) ?? []) {
      if (!by.has(requestId) || !Object.hasOwn(values, field)) continue
      const newer = own(store[key]?.values, field)
      if (Equal.equals(newer, values[field])) continue
      if (
        Option.exists(replayed(layer, key, field, newer), value =>
          Equal.equals(value, values[field]),
        )
      )
        continue
      const row = asked.get(key) ?? { entity, id, fields: new Set<string>() }
      row.fields.add(field)
      asked.set(key, row)
    }
  }
  const again = [...asked.values()].map(row => ({ ...row, fields: [...row.fields] }))
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
