/**
 * What evaluating a body in memory refuses: a refusal metakit's evaluator
 * gave, an operator the table lacks, a context or rows the run was not given.
 */
import { Option } from 'effect'
import type { Node } from 'metakit'
import { Expr, missingName, noOperators } from './expr.js'
import type { OperatorDescriptor, OperatorTable } from './expr.js'
import type { NowExpr, ViewerExpr } from './context.js'

export class QueryEvaluateError extends Error {
  /** What metakit's evaluator refused, when it is what refused the run. */
  readonly refusal: Option.Option<Node.Refusal>
  constructor(message: string, refusal: Option.Option<Node.Refusal> = Option.none()) {
    super(`[foldkit-entity] ${message}`)
    this.name = 'QueryEvaluateError'
    this.refusal = refusal
  }
}

/** A refusal of metakit's evaluator, as the failure of the run that met it. */
export const refusedBy = (refusal: Node.Refusal): QueryEvaluateError =>
  new QueryEvaluateError(`evaluation refused: ${refusal.message}`, Option.some(refusal))

/** An operator by its id, and its version when that is not the first. */
const operatorName = (operator: OperatorDescriptor): string =>
  operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`

/**
 * A call of a primitive operator the table does not implement. Its own class,
 * because a form judging an invariant reads it as a judgement it cannot make
 * (`Undecided`), not as a failure.
 */
export class OperatorMissingError extends QueryEvaluateError {
  readonly operator: OperatorDescriptor
  /** The operator by its id, and its version past the first. */
  readonly named: string
  /** `operators`, the table that lacks it, names the versions of it that it does hold. */
  constructor(operator: OperatorDescriptor, operators: OperatorTable = noOperators) {
    super(`this interpreter does not run the operator "${missingName(operator, operators)}"`)
    this.name = 'OperatorMissingError'
    this.operator = operator
    this.named = operatorName(operator)
  }
}

/**
 * A run that reads `Expr.viewer` or `Expr.now` and was given no context. No
 * row causes it, so `evaluateEach` refuses the run rather than each row.
 */
export class ContextMissingError extends QueryEvaluateError {
  constructor(term: ViewerExpr<unknown> | NowExpr<unknown>, why: string) {
    super(`this run reads ${Expr.show(term)}, but ${why}`)
    this.name = 'ContextMissingError'
  }
}

/**
 * What a run given one row could not decide without another: a path's or an
 * exists' row. It refuses rather than read the others as absent, which would
 * drop a row from a list on no evidence. `Judge` reads them from a holder.
 */
export class RowsMissingError extends QueryEvaluateError {
  constructor(reason: string) {
    super(`${reason}, which a run over one row cannot read; judge it with \`Judge\``)
    this.name = 'RowsMissingError'
  }
}
