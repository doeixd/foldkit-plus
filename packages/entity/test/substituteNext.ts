import { Option } from 'effect'
import { Node } from 'metakit'
import { exprOf } from '../src/expr/operand.js'
import type { Predicate } from '../src/index.js'

/**
 * The predicate with each `next.<key>` the write sets read as that value:
 * the substitution a write makes before it judges what a state invariant says
 * of the row it leaves.
 */
export const substituteNext = (
  predicate: Predicate,
  values: Readonly<Record<string, unknown>>,
): Predicate =>
  exprOf(
    Node.substitutePaths(predicate.node, segments =>
      segments[0] === 'next' && segments.length === 2 && Object.hasOwn(values, segments[1]!)
        ? Option.some(Node.Lit({ value: values[segments[1]!] }))
        : Option.none(),
    ),
  )
