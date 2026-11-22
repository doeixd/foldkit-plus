/**
 * The reading of `Rows` nodes (`rowsReading.ts`), loaded by every constructor
 * of one: a page that builds none never carries the folds.
 */
import * as Node from '../node.js'
import { partialRows } from './partialRows.js'
import { answersBy, Elements, elementsOf, foldAnswers } from './rows.js'
import { provideEvaluation, provideJudgement } from './rowsReading.js'

/** A `Rows` node over a whole environment, its source's value already read. */
const evaluate = (
  rows: Node.Rows,
  source: unknown,
  env: unknown,
  at: (node: Node.Node, env: unknown) => unknown,
): unknown =>
  Elements.$match(elementsOf(rows, source), {
    Value: ({ value }) => value,
    // An absent key reads as null, and so do related rows a row does not hold.
    Absent: () => null,
    Held: ({ elements, whole }) =>
      whole
        ? foldAnswers(rows, elements, answersBy(rows, elements, env, at))
        : new Node.Refusal({
            reason: 'unsupported',
            at: `rows.${rows.fold}`,
            detail: 'the environment holds some of the related rows, and evaluation needs all',
          }),
  })

/** Loads the evaluation of `Rows` nodes alone: what a list fold a transition runs needs. */
export const loadRowsEvaluation = (): void => provideEvaluation(evaluate)

/** Loads the reading of `Rows` nodes for evaluation and judgement; once is enough. */
export const loadRows = (): void => {
  provideEvaluation(evaluate)
  provideJudgement(partialRows)
}
