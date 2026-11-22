/**
 * Where evaluation (`evalNode`) and judgement (`judgeNode`, `settleNode`) find
 * how to read a `Rows` node. A page that never builds one (no `Expr.exists`,
 * no list fold, no related-rows constructor) then never carries the folds of
 * `rows.ts` and `partialRows.ts`: every constructor of a `Rows` node loads the
 * reading (`loadRows`, `rowsLoad.ts`) before it returns one, so any `Rows`
 * node a reader meets was built after it was loaded.
 */
import type * as Node from '../node.js'
import type { partialRows } from './partialRows.js'

/** How the readers read a `Rows` node: evaluated over a whole environment, or judged over part of one. */
export interface RowsReading {
  readonly evaluate: (
    rows: Node.Rows,
    source: unknown,
    env: unknown,
    at: (node: Node.Node, env: unknown) => unknown,
  ) => unknown
  readonly partial: typeof partialRows
}

let reading: RowsReading | undefined

/** Installs the reading; the first one installed stays. */
export const provideRows = (given: RowsReading): void => {
  reading ??= given
}

/**
 * The reading of `Rows`. Refuses loudly where none was loaded, which only a
 * node built by hand (`Node.Rows`, not a constructor) can reach: call
 * `loadRows` from `metakit/build` first.
 */
export const rowsReading = (): RowsReading => {
  if (reading === undefined) {
    throw new Error(
      '[metakit] a Rows node was read before its reading was loaded: build Rows with metakit/relation, a list fold or Expr.exists, or call loadRows from metakit/build first',
    )
  }
  return reading
}
