/**
 * Shared contract guard built from existing kernel nodes (`Match`, `If`,
 * `null.coalesce`): refuses `unmatched` naming the violated contract whenever
 * a guard condition evaluates to `false` or `null`, and lowers to a SQL `CASE`
 * with no `ELSE` so failed guards yield `NULL`.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import { coalesceOp } from './null.js'

/** One condition guarding an expression, paired with the contract label named in its refusal. */
export interface GuardCondition {
  readonly cond: Node.Node
  readonly contract: string
}

/**
 * Wrap `body` in nested fallback-free `Match` guards for each condition in
 * order. A condition evaluating to `false` or `null` refuses `unmatched` with
 * `contract` in its detail; a refused condition propagates its refusal.
 */
export const guardedBy = (conditions: ReadonlyArray<GuardCondition>, body: Node.Node): Node.Node =>
  conditions.reduceRight<Node.Node>(
    (acc, { cond, contract }) =>
      Node.Match({
        on: Node.If({
          cond: Node.Call({ op: coalesceOp, args: [cond, Node.Lit({ value: false })] }),
          then: Node.Lit({ value: 'ok' }),
          otherwise: Node.Lit({ value: contract }),
        }),
        cases: [['ok', acc]],
        otherwise: Option.none(),
      }),
    body,
  )
