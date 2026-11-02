/**
 * The store as a holder of rows (`HeldRows`), which `Judge` reads to foresee
 * a write's rules: a field the store was not sent is unheld, a row it never
 * read is unheld, a tombstone is known absent. It never holds every row
 * pointing at one, so an exists over the store is true where a pointing row
 * it holds passes the filter, and unknown otherwise.
 */
import { Option } from 'effect'
import {
  Held,
  idOfRef,
  type AnyEntity,
  type EntityIdentity,
  type HeldRow,
  type HeldRows,
  type OneRelation,
} from 'foldkit-entity'
import { entityKey, type EntityEntry, type EntityKey, type EntityStore } from './store.js'

/** One row's values: the store's, or the row a write leaves, which holds what it sets besides. */
interface Values {
  readonly values: Readonly<Record<string, unknown>>
  readonly present: ReadonlySet<string>
}

/** Holders by store: a store is replaced, never changed, and a holder indexes what points where. */
const holders = new WeakMap<EntityStore, StoreHolder>()

/** The store as a holder, and the row a write leaves in it. */
export interface StoreHolder {
  readonly rows: HeldRows
  /**
   * The row of `entity` with `id` as the store holds it, with a write's
   * `values` over it, and the fields it `moves` (an increment, a computed
   * value the server works out) not known.
   */
  readonly written: (
    entity: AnyEntity,
    id: string,
    values: Readonly<Record<string, unknown>>,
    moves: ReadonlyArray<string>,
  ) => HeldRow
}

/**
 * `store` as `Judge` reads it. Links are kept as ref keys (`'User:ada'`);
 * a row is read with each `one` relation as the id it points at, as
 * `Held.rows` takes it.
 */
export const holderOf = (store: EntityStore): StoreHolder => {
  const known = holders.get(store)
  if (known !== undefined) return known
  // By relation, the live rows linked through it, grouped by the ref key they hold. A stale
  // link may point elsewhere now, so it is left out: no row is ever all that points here.
  const pointers = new Map<OneRelation, ReadonlyMap<string, ReadonlyArray<HeldRow>>>()
  const pointersOf = (relation: OneRelation): ReadonlyMap<string, ReadonlyArray<HeldRow>> => {
    const indexed = pointers.get(relation)
    if (indexed !== undefined) return indexed
    const byTarget = new Map<string, Array<HeldRow>>()
    const prefix = `${relation.owner.name}:`
    for (const [key, entry] of Object.entries(store)) {
      if (!key.startsWith(prefix) || entry.tombstone || !entry.present.has(relation.key)) continue
      if (entry.stale.has(relation.key)) continue
      const link = entry.values[relation.key]
      if (typeof link !== 'string') continue
      const rows = byTarget.get(link) ?? []
      rows.push(rowOf(relation.owner, key, entry))
      byTarget.set(link, rows)
    }
    pointers.set(relation, byTarget)
    return byTarget
  }

  // By identity: a row pointing through a relation is known by its owner's identity alone.
  const rowOf = (entity: EntityIdentity<string>, at: EntityKey, row: Values): HeldRow => {
    const field = (key: string): Held<unknown> => {
      if (!row.present.has(key)) return Held.unheld(`${entity.name}.${key} is not held`)
      const value = row.values[key]
      return Held.isLink(entity, key) && value !== null && value !== undefined
        ? Held.of(idOfRef(value, `${entity.name}.${key}`))
        : Held.of(value)
    }
    return {
      field,
      follow: (relation: OneRelation) =>
        Held.match(field(relation.key), {
          onHeld: link =>
            link === null || link === undefined
              ? Held.of(Option.none<HeldRow>())
              : find(relation.target(), link),
          onUnheld: reason => Held.unheld<Option.Option<HeldRow>>(reason),
        }),
      pointing: relation => ({
        rows: pointersOf(relation).get(at) ?? [],
        missing: Option.some(
          `the store may not hold every ${relation.owner.name} pointing through ${relation.key}`,
        ),
      }),
    }
  }

  const live = (entity: AnyEntity, id: unknown): EntityEntry | undefined => {
    const entry = store[entityKey(entity.name, String(id))]
    return entry === undefined || entry.tombstone ? undefined : entry
  }

  const find = (entity: AnyEntity, id: unknown): Held<Option.Option<HeldRow>> => {
    const key = entityKey(entity.name, String(id))
    const entry = store[key]
    if (entry === undefined) return Held.unheld(`${entity.name} ${String(id)} is not held`)
    return Held.of(
      entry.tombstone ? Option.none() : Option.some(rowOf(entity.identity, key, entry)),
    )
  }

  const holder: StoreHolder = {
    rows: {
      find,
      row: (entity, id) =>
        Option.fromUndefinedOr(live(entity, id)).pipe(
          Option.map(entry => rowOf(entity.identity, entityKey(entity.name, String(id)), entry)),
        ),
      rows: entity => {
        const prefix = `${entity.name}:`
        return Object.entries(store).flatMap(([key, entry]) =>
          key.startsWith(prefix) && !entry.tombstone ? [rowOf(entity.identity, key, entry)] : [],
        )
      },
    },
    written: (entity, id, values, moves) => {
      const before = live(entity, id)
      const present = new Set([...(before?.present ?? []), ...Object.keys(values)])
      for (const key of moves) present.delete(key)
      return rowOf(entity.identity, entityKey(entity.name, id), {
        values: { ...before?.values, ...values },
        present,
      })
    },
  }
  holders.set(store, holder)
  return holder
}
