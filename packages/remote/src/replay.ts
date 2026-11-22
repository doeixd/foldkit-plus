/**
 * A pending write replayed over a newer server value: a live patch, or a read
 * answered beside the write, lands on a field the write moves while it is in
 * flight. The write's way of writing for that field decides, as metakit's
 * `writeProperties` says of it:
 * - one that commutes with any change to the field (an `add`) shows over what
 *   the field held before a patch, or as a read left it, since the read may
 *   include it; replayed over the newer value it gives the server's value
 *   after both, so an answer that is that replay, and whose revision shows it
 *   landed right on the newer value, settles the field with no second read;
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
import { addWrites, setWrites, type WayOfWriting, type WriteProperties } from 'metakit'
import { noKept, type Kept, type KeptField } from './kept.js'
import type { EntityLayer } from './optimistic.js'
import { own } from './record.js'
import {
  entityKey,
  olderThanHeld,
  type EntityEntry,
  type EntityKey,
  type EntityStore,
} from './store.js'

/** Long past any stream's lag behind an answer: it only bounds what the Model keeps (echoes and `kept` alike). */
export const echoKept = 60_000

export interface Row {
  readonly entity: string
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
  readonly revision?: number | undefined
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
 * does not count the write twice (#498). A read may include any write in
 * flight while it was answered, and nothing in it says which: when it was sent
 * does not decide, since the server may land a write sent after a read before
 * it runs the read. So each field it moves is kept at its own value for every
 * pending request, and marked `included`: a relative layer shows the read's
 * value as it is, never past the server's count, and the request's answer
 * settles the field or reads it again (#480). A request new to a field began
 * after the values it already has, and is kept over what the store held
 * before this one.
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
  for (const { entity, id, values, revision } of rows) {
    const key = entityKey(entity, id)
    const under = store[key]
    // A row rejected by `writeEntities` as older than what the store holds never moves it.
    if (olderThanHeld(under, revision)) continue
    const held = (field: string): Option.Option<unknown> =>
      under !== undefined && !under.tombstone && under.present.has(field)
        ? Option.some(own(under.values, field))
        : Option.none()
    const advanced =
      revision !== undefined && under?.revision !== undefined && revision > under.revision
    const fields =
      from === 'patch' || advanced
        ? Object.keys(values)
        : Object.keys(values).filter(
            field => !Equal.equals(own(under?.values, field), values[field]),
          )
    const row = new Map(next.get(key))
    let changed = false
    for (const field of fields) {
      const was = row.get(field)
      const ids =
        from === 'read'
          ? [...pending]
          : [...pending].filter(id => was === undefined || !was.by.has(id))
      if (ids.length === 0) continue
      changed = true
      const over = from === 'patch' ? held(field) : Option.some(values[field])
      row.set(field, {
        since: was?.since ?? now,
        by: new Map([...(was?.by ?? []), ...ids.map(id => [id, over] as const)]),
        included: from === 'read' ? new Set([...(was?.included ?? []), ...ids]) : was?.included,
      })
    }
    if (changed) next = new Map(next).set(key, row)
  }
  return next
}

/**
 * Whether a write of `way`, whose row of `writeProperties` is `row`, replayed
 * over any newer value of its path gives the value after both: it commutes
 * with another write of its way whatever their values. Two `set`s commute
 * only when they set one literal. Read through the two rows a pending write
 * uses, so a page keeps no other.
 */
const replays = (row: WriteProperties, way: WayOfWriting): boolean => {
  const condition = row.commutes[way]
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
  let touched = false
  let delta = 0
  for (const patch of layer?.patches ?? []) {
    if (entityKey(patch.entity, patch.id) !== key) continue
    const sets = Object.hasOwn(patch.values, field)
    const computes = patch.computes !== undefined && Object.hasOwn(patch.computes, field)
    const amount = own(patch.adds, field)
    if (!sets && !computes && amount === undefined) continue
    touched = true
    if (sets || computes) {
      if (sets && !computes && amount === undefined && replays(setWrites, 'set')) {
        return Option.some(own(patch.values, field))
      }
      return Option.none()
    }
    if (typeof amount !== 'number') return Option.none()
    delta += amount
  }
  if (!touched) return Option.none()
  return replays(addWrites, 'add') && typeof newer === 'number'
    ? Option.some(newer + delta)
    : Option.none()
}

/**
 * Whether an answer at `revision` is the change right after the row `held`,
 * whose `field` was written at the held revision: nothing landed between the
 * two. Every change moves a revision forward, so a whole step of one leaves
 * room for no other. An answer equal to the replay is not enough alone: a like
 * after ours and an unlike after that make it equal while the server holds the
 * newer value. With no revision to go by, the field is read again.
 */
const rightAfter = (
  held: EntityEntry | undefined,
  revision: number | undefined,
  field: string,
): boolean =>
  held?.revision !== undefined &&
  Number.isSafeInteger(held.revision) &&
  held.revision < Number.MAX_SAFE_INTEGER &&
  revision === held.revision + 1 &&
  held.revisionFields?.has(field) === true

/**
 * What `requestId`'s answer, `entities`, does to the values kept, and what it
 * reads again. `layer` is the request's, and `pending` the requests still in
 * flight after it; with none, nothing is kept.
 *
 * The answer removes `requestId` from the kept fields it settles while
 * preserving entries for other requests still in `pending`. One a newer value
 * moved while the request was pending, to other than the answer's value, is
 * read again, unless the write's way replays, the answer is the write replayed
 * over that value, and it landed right after it (`rightAfter`).
 */
export const settleReplayed = (
  kept: Kept,
  store: EntityStore,
  layer: EntityLayer | undefined,
  requestId: string,
  entities: ReadonlyArray<Row>,
  pending: ReadonlySet<string>,
  now: number,
  earlier?: ReadonlySet<string>,
  applied: ReadonlyArray<Row> = entities,
): { readonly kept: Kept; readonly again: ReadonlyArray<AgainRow> } => {
  const held = unexpired(kept, now)
  const asked = new Map<EntityKey, { entity: string; id: string; fields: Set<string> }>()
  for (const { entity, id, values, revision } of entities) {
    const key = entityKey(entity, id)
    for (const [field, { by }] of held.get(key) ?? []) {
      if (!by.has(requestId) || !Object.hasOwn(values, field)) continue
      const newer = own(store[key]?.values, field)
      if (Equal.equals(newer, values[field])) continue
      if (
        rightAfter(store[key], revision, field) &&
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
  for (const { entity, id, values } of applied) {
    const key = entityKey(entity, id)
    const row = next.get(key)
    if (row === undefined) continue
    const rest = new Map<string, KeptField>()
    for (const [field, entry] of row) {
      if (!Object.hasOwn(values, field)) {
        rest.set(field, entry)
        continue
      }
      // Rebase any other pending requests on this field over the settled answer's value
      // while keeping them tracked so a stale later answer still triggers a reread.
      const rebased = Option.some(values[field])
      const by = new Map(
        [...entry.by]
          .filter(([pendingId]) => pendingId !== requestId && pending.has(pendingId))
          .map(([pendingId]) => [pendingId, rebased] as const),
      )
      // A request the read may include still may, and a request sent earlier than the
      // one settling out of order may already be included in this answer's value.
      const includedIds = [
        ...(entry.included ? [...entry.included].filter(id => by.has(id)) : []),
        ...(earlier ? [...earlier].filter(id => by.has(id)) : []),
      ]
      const included = includedIds.length > 0 ? new Set(includedIds) : undefined
      if (by.size > 0) rest.set(field, { since: entry.since, by, included })
    }
    if (rest.size === 0) next.delete(key)
    else next.set(key, rest)
  }
  return { kept: next, again }
}
