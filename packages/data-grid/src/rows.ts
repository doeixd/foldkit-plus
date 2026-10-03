import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

/**
 * How many rows a grid can address. A local array, or a server that reports
 * its total, is `Known`; a cursor that has not reached its end is `Unknown`,
 * with the rows seen so far as a lower bound.
 */
export const RowCount = defineTaggedUnion({
  /** Exactly `total` rows, loaded or not. */
  Known: { total: Schema.Number },
  /** At least `atLeast` rows; more may follow. */
  Unknown: { atLeast: Schema.Number },
})
export type RowCount = typeof RowCount.Type

/**
 * Where the rows' source stands, for a view to say: `Loading` before any
 * answer, `Refreshing` while a newer one is on its way and the rows shown are
 * the last good ones, `Failed` with what went wrong. The grid holds no
 * loading state of its own; the source's owner (Remote, a store) says this.
 */
export const RowStatus = defineTaggedUnion({
  Ready: {},
  Loading: {},
  Refreshing: {},
  Failed: { message: Schema.String },
})
export type RowStatus = typeof RowStatus.Type

/** The number of row indexes a grid may address: the total, or the lower bound. */
export const addressableRows = RowCount.match({
  Known: ({ total }) => total,
  Unknown: ({ atLeast }) => atLeast,
})

/**
 * Logical row space: rows by index, each with a stable key, whatever stores
 * or fetches them. Indexes follow the order the application supplies, so a
 * sorted or filtered result is the application's, not the grid's. An index
 * that is in range may still have no row yet (a page not loaded), so every
 * lookup is an `Option`.
 */
export interface RowModel<Row> {
  readonly count: RowCount
  rowAt(index: number): Option.Option<Row>
  keyAt(index: number): Option.Option<string>
  indexOf(key: string): Option.Option<number>
}

interface ArrayModel {
  readonly key: (row: never) => string
  readonly model: RowModel<unknown>
}

// One model per array, so a view that keeps its rows array between renders
// indexes the keys once. A key function made inline on every render misses.
const arrayModels = new WeakMap<ReadonlyArray<unknown>, ArrayModel>()

const isIndex = (index: number, count: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < count

const makeArrayModel = <Row>(
  rows: ReadonlyArray<Row>,
  key: (row: Row) => string,
): RowModel<Row> => {
  const keys = rows.map(key)
  const indexes = new Map<string, number>()
  keys.forEach((rowKey, index) => {
    const earlier = indexes.get(rowKey)
    if (earlier !== undefined) {
      throw new Error(
        `RowModel.fromArray: rows ${earlier} and ${index} share the key "${rowKey}"; a row key must identify one row.`,
      )
    }
    indexes.set(rowKey, index)
  })
  return {
    count: RowCount.Known({ total: rows.length }),
    rowAt: index => (isIndex(index, rows.length) ? Option.some(rows[index]!) : Option.none()),
    keyAt: index => (isIndex(index, keys.length) ? Option.some(keys[index]!) : Option.none()),
    indexOf: rowKey => Option.fromUndefinedOr(indexes.get(rowKey)),
  }
}

export const RowModel = {
  /**
   * Rows held in memory, in the order given. Throws when two rows share a
   * key, since focus and selection would then name two rows at once.
   */
  fromArray: <Row>(rows: ReadonlyArray<Row>, key: (row: Row) => string): RowModel<Row> => {
    const cached = arrayModels.get(rows)
    if (cached !== undefined && cached.key === key) return cached.model as RowModel<Row>
    const model = makeArrayModel(rows, key)
    arrayModels.set(rows, { key, model })
    return model
  },
}
