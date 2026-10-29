/**
 * The store as a holder of rows (`HeldRows`), which `Judge` reads to foresee
 * a write's rules: a field the store was not sent is unheld, a row it never
 * read is unheld, a tombstone is known absent. It never holds every row
 * pointing at one, so an exists over the store is unknown unless a pointing
 * row it holds decides it.
 */
import { Option } from 'effect'
import {
  Held,
  idOfRef,
  type AnyEntity,
  type HeldRow,
  type HeldRows,
  type OneRelation,
} from 'foldkit-entity'
import { entityKey, type EntityEntry, type EntityStore } from './store.js'

/** One row's values: the store's, or the row a write leaves, which holds what it sets besides. */
interface Values {
  readonly values: Readonly<Record<string, unknown>>
  readonly present: ReadonlySet<string>
}

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
  const rowOf = (entity: AnyEntity, row: Values): HeldRow => {
    const field = (key: string): Held<unknown> => {
      if (!row.present.has(key)) return Held.unheld(`${entity.name}.${key} is not held`)
      const value = row.values[key]
      const relation = Object.hasOwn(entity.relations, key) ? entity.relations[key] : undefined
      return relation?.cardinality === 'one' && value !== null && value !== undefined
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
        rows: [],
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
    const entry = store[entityKey(entity.name, String(id))]
    if (entry === undefined) return Held.unheld(`${entity.name} ${String(id)} is not held`)
    return Held.of(entry.tombstone ? Option.none() : Option.some(rowOf(entity, entry)))
  }

  return {
    rows: {
      find,
      row: (entity, id) =>
        Option.fromUndefinedOr(live(entity, id)).pipe(Option.map(entry => rowOf(entity, entry))),
      rows: entity => {
        const prefix = `${entity.name}:`
        return Object.entries(store).flatMap(([key, entry]) =>
          key.startsWith(prefix) && !entry.tombstone ? [rowOf(entity, entry)] : [],
        )
      },
    },
    written: (entity, id, values, moves) => {
      const before = live(entity, id)
      const present = new Set([...(before?.present ?? []), ...Object.keys(values)])
      for (const key of moves) present.delete(key)
      return rowOf(entity, { values: { ...before?.values, ...values }, present })
    },
  }
}
