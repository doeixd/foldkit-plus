/**
 * Where evaluation (`evalNode`) and judgement (`judgeNode`, `settleNode`) find
 * how to read a `Rows` node. A page that never builds one (no `Expr.exists`,
 * no list fold, no related-rows constructor) then never carries the folds of
 * `rows.ts` and `partialRows.ts`: every constructor of a `Rows` node loads the
 * reading (`rowsLoad.ts`) before it returns one, so any `Rows` node a reader
 * meets was built after it was loaded. A list fold loads evaluation alone, as
 * a transition runs it; whatever judges one (`Expr.judge`, `Transition.can`)
 * loads judgement too.
 */
import type * as Node from '../node.js'
import type { partialRows } from './partialRows.js'

/** A `Rows` node over a whole environment, its source's value already read. */
export type RowsEvaluation = (
  rows: Node.Rows,
  source: unknown,
  env: unknown,
  at: (node: Node.Node, env: unknown) => unknown,
) => unknown

let evaluation: RowsEvaluation | undefined
let judgement: typeof partialRows | undefined

/** Installs the evaluation of `Rows`; the first one installed stays. */
export const provideEvaluation = (given: RowsEvaluation): void => {
  evaluation ??= given
}

/** Installs the judgement of `Rows` over part of an environment; the first one installed stays. */
export const provideJudgement = (given: typeof partialRows): void => {
  judgement ??= given
}

/**
 * Refuses loudly where nothing loaded the reading, which only a node built by
 * hand (`Node.Rows`, not a constructor) can reach.
 */
const unloaded = (): never => {
  throw new Error(
    '[metakit] a Rows node was read before its reading was loaded: build Rows with metakit/relation, a list fold or Expr.exists, or call loadRows from metakit/build first',
  )
}

/** The evaluation of `Rows`. */
export const rowsEvaluation = (): RowsEvaluation => evaluation ?? unloaded()

/** The judgement of `Rows` over part of an environment. */
export const rowsJudgement = (): typeof partialRows => judgement ?? unloaded()
