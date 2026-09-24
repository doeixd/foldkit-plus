/**
 * The pure requirement planner.
 *
 * A `Requirement` is plain data: which entity fields a Remote projection needs,
 * and through `relations`, which fields of each relation's target. `plan` diffs
 * requirements against the store and returns only the missing fields, grouped
 * and deterministically ordered. A relation whose field is being fetched keeps
 * its nested requirement on the request, so the server resolves the graph in
 * one read; a relation whose refs the store already holds is followed into
 * concrete requirements for the targets. Time enters through `PlanFreshness`,
 * never from ambient state; `force` plans every field.
 */
import { stableStringify } from './query.js'
import { targetsOf } from './relation.js'
import { Requirement, type RelationRequirement } from './requirement.js'
import { entityKey, missingFields, readField, type EntityStore } from './store.js'

type Window = NonNullable<Requirement['windows']>[string]

/** A stable key for a window, so two equal windows compare equal. */
export const windowKey = (window: Window): string => stableStringify(window)

export interface PlanFreshness {
  readonly now: number
  /** A present entry older than this many milliseconds is refreshed whole. */
  readonly freshness: number
}

export interface PlanOptions {
  readonly freshness?: PlanFreshness | undefined
  /** Plan every requested field, present or not, tombstoned or not. */
  readonly force?: boolean | undefined
}

const pickFields = <T>(
  record: Readonly<Record<string, T>> | undefined,
  fields: ReadonlySet<string>,
): Readonly<Record<string, T>> | undefined => {
  if (record === undefined) return undefined
  const picked = Object.fromEntries(Object.entries(record).filter(([field]) => fields.has(field)))
  return Object.keys(picked).length === 0 ? undefined : picked
}

/** The concrete requirements a known relation value contributes for its targets. */
const followRelation = (
  value: unknown,
  relation: RelationRequirement,
): ReadonlyArray<Requirement> =>
  targetsOf(value, relation).map(ref => ({ ...relation, id: ref.id }))

/** When present values next go stale, and the requirements of the entities that do. */
export interface Deadline {
  readonly at: number
  readonly due: ReadonlyArray<Requirement>
}

/**
 * The earliest moment a value `requirements` read, following the relations the
 * store holds as `plan` does, goes stale under `freshness`, with the
 * requirements of the entities that go stale then. Nothing when no value is
 * both present and still fresh: what is already expired or stale is planned,
 * not awaited, which is what keeps a timer from firing on what it already
 * fired on.
 */
export const deadlineOf = (
  store: EntityStore,
  requirements: readonly Requirement[],
  freshness: PlanFreshness,
): Deadline | undefined => {
  let at: number | undefined
  let due: Requirement[] = []
  const walk = (group: Requirement): void => {
    const key = entityKey(group.entity, group.id)
    const entry = store[key]
    if (entry === undefined || entry.tombstone) return
    const fresh = group.fields.some(field => entry.present.has(field) && !entry.stale.has(field))
    if (fresh) {
      const expires = entry.updatedAt + freshness.freshness
      if (expires > freshness.now) {
        if (at === undefined || expires < at) {
          at = expires
          due = [group]
        } else if (expires === at) due.push(group)
      }
    }
    for (const [field, relation] of Object.entries(group.relations ?? {})) {
      const value = readField(store, key, field)
      if (value._tag === 'Some')
        for (const next of followRelation(value.value, relation)) walk(next)
    }
  }
  for (const group of Requirement.merge(requirements)) walk(group)
  return at === undefined ? undefined : { at, due: Requirement.merge(due) }
}

export const plan = (
  store: EntityStore,
  requirements: readonly Requirement[],
  options: PlanOptions = {},
): ReadonlyArray<Requirement> => {
  const { freshness, force = false } = options
  const planned: Requirement[] = []
  const followed: Requirement[] = []

  for (const group of Requirement.merge(requirements)) {
    const key = entityKey(group.entity, group.id)
    const entry = store[key]
    const expired =
      freshness !== undefined &&
      entry !== undefined &&
      !entry.tombstone &&
      freshness.now - entry.updatedAt > freshness.freshness
    const windowKeys = Object.fromEntries(
      Object.entries(group.windows ?? {}).map(([field, window]) => [field, windowKey(window)]),
    )
    const missing =
      force || expired ? group.fields : missingFields(store, key, group.fields, windowKeys)
    const missingSet = new Set(missing)

    // A relation the store already holds is followed into its targets; one
    // being fetched rides on the request instead.
    for (const [field, relation] of Object.entries(group.relations ?? {})) {
      if (missingSet.has(field)) continue
      const value = readField(store, key, field)
      if (value._tag === 'Some') followed.push(...followRelation(value.value, relation))
    }

    if (missing.length === 0) continue
    // Only a field being fetched carries its window and its relation.
    const windows = pickFields(group.windows, missingSet)
    const relations = pickFields(group.relations, missingSet)
    planned.push({
      entity: group.entity,
      id: group.id,
      fields: missing,
      ...(windows === undefined ? {} : { windows }),
      ...(relations === undefined ? {} : { relations }),
    })
  }

  const nested = followed.length === 0 ? [] : plan(store, followed, options)
  return [...Requirement.merge([...planned, ...nested])].sort((a, b) =>
    entityKey(a.entity, a.id) < entityKey(b.entity, b.id) ? -1 : 1,
  )
}
