/**
 * The checker's row for any operator: a core one's from `abstractOps`, and
 * for a foreign one a row that decides nothing unless an implementation is in
 * view and a `monotone` claim lets the checker bound it from its corners.
 */
import { Match, Option, SchemaAST } from 'effect'
import * as Node from '../node.js'
import { applyForeign, type ForeignImplementations } from '../ops/eval.js'
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

const CONVEX_NUMERIC_CHECKS: ReadonlySet<string> = new Set([
  'effect/schema/isInt',
  'effect/schema/isFinite',
  'effect/schema/isGreaterThan',
  'effect/schema/isGreaterThanOrEqualTo',
  'effect/schema/isLessThan',
  'effect/schema/isLessThanOrEqualTo',
  'effect/schema/isBetween',
])

const flatChecks = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>> | undefined,
): ReadonlyArray<SchemaAST.Check<unknown>> =>
  (checks ?? []).flatMap(check =>
    Match.valueTags(check, {
      FilterGroup: group => flatChecks(group.checks),
      Filter: filter => [filter],
    }),
  )

const numericArgShape = (
  ast: SchemaAST.AST,
): { readonly convex: boolean; readonly isInt: boolean } => {
  if (!SchemaAST.isNumber(ast)) return { convex: false, isInt: false }
  const checks = flatChecks(ast.checks)
  const convex = checks.every(check => {
    const id = check.annotations?.representation?.id
    return id !== undefined && CONVEX_NUMERIC_CHECKS.has(id)
  })
  const isInt = checks.some(
    check => check.annotations?.representation?.id === 'effect/schema/isInt',
  )
  return { convex, isInt }
}

const evaluateCorners = (
  op: Node.ForeignOp,
  foreign: ForeignImplementations,
  monotone: ReadonlyArray<Node.MonotoneDirection>,
  checkArgs: ReadonlyArray<Node.ForeignSchemaCheck>,
  intervals: ReadonlyArray<Interval.Interval>,
): Option.Option<readonly [lo: number, hi: number]> => {
  if (intervals.length !== monotone.length || checkArgs.length !== monotone.length) {
    return Option.none()
  }
  const loArgs: Array<number> = []
  const hiArgs: Array<number> = []
  for (let i = 0; i < monotone.length; i++) {
    const iv = intervals[i]!
    if (Interval.isBottom(iv) || !Number.isFinite(iv.lo) || !Number.isFinite(iv.hi)) {
      return Option.none()
    }
    const dir = monotone[i]!
    if (dir === 'none' && iv.lo !== iv.hi) return Option.none()
    const check = checkArgs[i]!
    if (!check.is(iv.lo) || !check.is(iv.hi)) return Option.none()
    if (dir === 'down') {
      loArgs.push(iv.hi)
      hiArgs.push(iv.lo)
    } else {
      loArgs.push(iv.lo)
      hiArgs.push(iv.hi)
    }
  }
  const loVal = applyForeign(op, loArgs, foreign)
  const hiVal = applyForeign(op, hiArgs, foreign)
  if (
    typeof loVal !== 'number' ||
    typeof hiVal !== 'number' ||
    !Number.isFinite(loVal) ||
    !Number.isFinite(hiVal) ||
    loVal > hiVal
  ) {
    return Option.none()
  }
  return Option.some([loVal, hiVal] as const)
}

const monotoneForeignTerm = (
  op: Node.ForeignOp,
  foreign: ForeignImplementations,
  monotone: ReadonlyArray<Node.MonotoneDirection>,
  checkArgs: ReadonlyArray<Node.ForeignSchemaCheck>,
): TermOp => {
  const argShapes = (op.args ?? []).map(arg => numericArgShape(arg.ast))
  const resultShape =
    op.result !== undefined ? numericArgShape(op.result.ast) : { convex: false, isInt: false }
  const resultIsInt = resultShape.isInt
  const allNumeric = op.args !== undefined && op.args.every(arg => SchemaAST.isNumber(arg.ast))
  return {
    _tag: 'Term',
    range: Interval.top,
    forward: intervals => {
      if (intervals.some(Interval.isBottom)) return Interval.bottom
      return Option.match(evaluateCorners(op, foreign, monotone, checkArgs, intervals), {
        onNone: () => Interval.top,
        onSome: ([lo, hi]) => Interval.between(lo, hi),
      })
    },
    integral: () => resultIsInt,
    refuses: true,
    unrefused: (intervals, isInts) => {
      if (!resultShape.convex || intervals.length !== argShapes.length) return false
      if (resultShape.isInt && intervals.some((iv, i) => iv.lo !== iv.hi && isInts[i] !== true)) {
        return false
      }
      for (let i = 0; i < intervals.length; i++) {
        const iv = intervals[i]!
        const shape = argShapes[i]!
        if (iv.lo !== iv.hi && (!shape.convex || (shape.isInt && isInts[i] !== true))) {
          return false
        }
      }
      return Option.isSome(evaluateCorners(op, foreign, monotone, checkArgs, intervals))
    },
    relation: 'none',
    unportable: !allNumeric,
  }
}

export const abstractOf = (op: Node.AnyOp, foreign?: ForeignImplementations): AbstractOp => {
  if (!Node.isForeign(op)) return abstractOps[op.id]
  if (
    op.nulls === 'strict' &&
    op.returns === 'number' &&
    foreign !== undefined &&
    Object.hasOwn(foreign, Node.foreignName(op)) &&
    op.claims?.monotone !== undefined &&
    op.checkArgs !== undefined &&
    op.args !== undefined
  ) {
    return monotoneForeignTerm(op, foreign, op.claims.monotone, op.checkArgs)
  }
  const rows: Readonly<Record<Node.ValueKind, AbstractOp>> = {
    number: foreignTerm,
    boolean: foreignPredicate,
    text: foreignValue,
  }
  return rows[op.returns]
}
