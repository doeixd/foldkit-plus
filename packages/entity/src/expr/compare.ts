/**
 * Order comparisons (`Expr.lt`, `lte`, `gt`, `gte`): metakit's `ord.*` for
 * numbers and `str.*` for text, whose sides are folded by `str.lowerAscii`
 * when the comparison's collation is `asciiFold` (the kernel convergence
 * note, "How does a collation reach a text operation?"). The collation is
 * chosen here, where the comparison is written, and reaches no operation.
 */
import { Option, type Schema } from 'effect'
import { Node, Ord, Str } from '@doeixd/metakit'
import type { Collation } from '../collation.js'
import type { EntityField } from '../index.js'
import type { Fits } from './logic.js'
import {
  collationOf,
  exprOf,
  folded,
  made,
  originOf,
  toNode,
  type CompareOperator,
  type Expr,
  type OrderedOperand,
  type Predicate,
  type Reads,
  type ReadsOf,
  type ValueOf,
} from './operand.js'
import { kindOf } from './kind.js'
import { show } from './show.js'

const numberOrder: { readonly [K in CompareOperator]: Node.Op } = {
  lt: Ord.ltOp,
  lte: Ord.lteOp,
  gt: Ord.gtOp,
  gte: Ord.gteOp,
}

const textOrder: { readonly [K in CompareOperator]: Node.Op } = {
  lt: Str.ltOp,
  lte: Str.lteOp,
  gt: Str.gtOp,
  gte: Str.gteOp,
}

/** Whether a node can say how its text orders: a field (through a path too), or a call. */
const votes = (node: Node.Node): boolean =>
  Option.exists(originOf(node), origin =>
    ['Field', 'Hop', 'ViewerHop', 'Call'].includes(origin._tag),
  )

/**
 * How a comparison's text compares: the collation given, else the field's
 * declared one. Text orders differently by backend (SQLite's `BINARY`, the
 * Postgres database's locale, JavaScript's UTF-16 units), so it is compared
 * only under `binary` or `asciiFold`, which every reader here agrees on, and
 * only against a field or a call, whose collation it is. Numbers need none.
 */
const collationFor = (
  step: CompareOperator,
  left: Node.Node,
  right: Node.Node,
  given: Option.Option<Collation>,
): Option.Option<Collation> => {
  const kinds = new Set([kindOf(left), kindOf(right)].filter(kind => kind !== 'null'))
  if (kinds.has('boolean') || kinds.has('other') || kinds.size > 1) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: only numbers with numbers, or text with text, order alike in every interpreter, as stored`,
    )
  }
  if (!kinds.has('text')) return Option.none()
  // The sides that can say how text orders: a field, as declared, or a call, as its
  // operator's rule carries one. A literal or an input says nothing.
  const fields = [left, right]
    .filter(votes)
    .map(side => ({ name: show(exprOf(side)), collation: collationOf(side) }))
  const [first] = fields
  if (first === undefined) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: text compared with no field, nor a call carrying a collation, to say how it orders`,
    )
  }
  const named = fields.map(field => field.name).join(' and ')
  const collations = Option.match(given, {
    onSome: collation => [collation],
    onNone: () =>
      fields.map(field =>
        Option.getOrElse(field.collation, () => {
          throw new Error(
            `[foldkit-entity] Expr.${step}: ${field.name} is text with no declared collation, so backends would order it differently; declare Collation.binary or Collation.asciiFold on it, or pass one`,
          )
        }),
      ),
  })
  const [collation] = collations
  if (collation === undefined || collations.some(each => each._tag !== collation._tag)) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: ${named} declare different collations; pass one to compare them by`,
    )
  }
  if (collation._tag === 'Locale') {
    throw new Error(
      `[foldkit-entity] Expr.${step}: ${named} compares by the backend's "${collation.locale}" collation, which only that backend has`,
    )
  }
  return Option.some(collation)
}

/** What a comparison's other side may be, typed from the side it is applied to: a field too. */
type CompareRight<L> =
  | ValueOf<L>
  | Expr<ValueOf<L> | null>
  | EntityField<string, string, Schema.Constraint & Schema.Codec<ValueOf<L> | null, any, any, any>>

/** `Expr.lt` and its siblings' `step`: the comparison's right side and options, then its left. */
export type CompareStep = <const R>(
  right: R,
  options?: { readonly collation?: Collation | undefined },
) => <L extends OrderedOperand>(
  left: L & Fits<R, CompareRight<L>, 'a comparison step'>,
) => Predicate & Reads<ReadsOf<L> | ReadsOf<R>>

/** `Expr.lt` and its three siblings: the operator fixed, the sides typed alike. */
const comparison = (operator: CompareOperator) => {
  const compare = <L extends OrderedOperand, R extends CompareRight<L>>(
    left: L,
    right: R,
    options: { readonly collation?: Collation | undefined } = {},
  ): Predicate & Reads<ReadsOf<L> | ReadsOf<R>> => {
    const leftSide = toNode(left)
    const rightSide = toNode(right)
    const collation = collationFor(
      operator,
      leftSide,
      rightSide,
      Option.fromUndefinedOr(options.collation),
    )
    const node = Option.match(collation, {
      onNone: () => Node.Call({ op: numberOrder[operator], args: [leftSide, rightSide] }),
      onSome: each =>
        Node.Call({
          op: textOrder[operator],
          args: [folded(each, leftSide), folded(each, rightSide)],
        }),
    })
    return exprOf(made(node, { _tag: 'Compare', operator, left: leftSide, right: rightSide }))
  }
  const step: CompareStep = (right, options) => left => compare(left, right as never, options)
  return Object.assign(compare, { step })
}

/**
 * `left` orders before `right`. Numbers compare as numbers; text compares
 * under a collation, the one given or the field's declared one, which must be
 * `binary` or `asciiFold` (so every backend agrees), and text needs a field
 * or a call on one side. A date compares by its encoded form: as text when it
 * is stored as an ISO string, so its field declares `Collation.binary`. A
 * null on either side is unknown, so the row is matched by neither this nor
 * its `not`.
 *
 * ```ts
 * Expr.lt(fields.cents, 1000)
 * Expr.and(Expr.gte(fields.at, input.from), Expr.lt(fields.at, input.until))
 * ```
 */
export const lt = comparison('lt')
/** `left` orders before `right`, or with it; see `Expr.lt`. */
export const lte = comparison('lte')
/** `left` orders after `right`; see `Expr.lt`. */
export const gt = comparison('gt')
/** `left` orders after `right`, or with it; see `Expr.lt`. */
export const gte = comparison('gte')
