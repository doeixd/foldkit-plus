/**
 * The checker's row for any operator: a core one's from `abstractOps`, and
 * for a foreign one a row that decides nothing, since no implementation is in
 * view and any may refuse or give null.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import * as Verdict from '../verdict.js'
import * as Interval from './interval.js'
import { abstractOps, type AbstractOp, type PredicateOp, type TermOp, type ValueOp } from './ops.js'

const foreignTerm: TermOp = {
  _tag: 'Term',
  range: Interval.top,
  forward: () => Interval.top,
  integral: () => false,
  refuses: true,
  relation: 'none',
  unportable: true,
}

const foreignPredicate: PredicateOp = {
  _tag: 'Predicate',
  unportable: true,
  neverNull: false,
  measures: () => [],
  valued: () => false,
  decide: () =>
    Verdict.Unknown(
      'a foreign operation, which the checker cannot see into',
      Option.some({ kind: 'unsupported', detail: 'a foreign operation' }),
    ),
  assume: () => {},
  refute: () => {},
}

const foreignValue: ValueOp = { _tag: 'Value', unportable: true, valued: () => false }

export const abstractOf = (op: Node.AnyOp): AbstractOp => {
  if (!Node.isForeign(op)) return abstractOps[op.id]
  const rows: Readonly<Record<Node.ValueKind, AbstractOp>> = {
    number: foreignTerm,
    boolean: foreignPredicate,
    text: foreignValue,
  }
  return rows[op.returns]
}
