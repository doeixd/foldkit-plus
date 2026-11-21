/**
 * Cross-record Aggregates (`metakit/aggregates`). This module evaluates in
 * memory and imports no SQL, so a page can use it; `metakit/aggregates/sql`
 * compiles the same aggregates to SQL. What each keeps is not declared here:
 * it is read off the fold's row of `foldProperties`.
 *
 * - **Totals** (`Rows.sum`, `Rows.count`): the folds `sum` and `count` are
 *   commutative, associative and invertible over the integers, so an insert,
 *   update or delete moves the value by an O(1) delta (`new - old`), starting
 *   from the fold's identity. The delta is exact only over that domain, so
 *   the contribution must be integer-valued (a `Schema.Int`, `Money` or
 *   `Decimal` field, or integer arithmetic over them): floating-point
 *   addition is not invertible (`0.1 + 0.2 + 0.3 - 0.2` is
 *   `0.4000000000000001`). The symbolic deltas let `Prove.transition` prove a
 *   rule over any number of rows.
 * - **Extremes and tests** (`Rows.min`, `Rows.max`, `Rows.every`,
 *   `Rows.any`): their folds are not invertible, so an insert is O(1) while
 *   deleting or updating the extremum rescans the rows.
 *
 * Missing values follow SQL: `sum`, `min` and `max` skip a `null`
 * contribution, `count` with a predicate and `any` count an unknown predicate
 * as false, and `every` counts it as failing (`coalesce(p, false)`).
 */
import { Option, SchemaAST } from 'effect'
import type { Schema } from 'effect'
import * as Expr from './expr.js'
import { isIntCheck } from './intCheck.js'
import * as Node from './node.js'
import { toNode, wrap, type ExprInput } from './ops/core.js'
import * as Num from './ops/num.js'
import * as Path from './path.js'
import type { PathAccessor } from './path.js'
import { foldProperties } from './properties.js'

interface GroupAggregate<Row, A extends number> {
  /** The total over no row: the fold's identity. */
  readonly identity: A
  readonly rowSchema: Schema.Codec<Row>
  /** Per-row contribution expression (for `count`, `1` or `if pred then 1 else 0`). */
  readonly contribution: Expr.Expr<Row, A>
  /** Evaluate the aggregate over a concrete array of rows. */
  readonly evaluate: (rows: ReadonlyArray<Row>) => A
  /** Exact O(1) delta for inserting `row`: `next = prev + insertDelta(row)`. */
  readonly insertDelta: (row: Row) => A
  /** Exact O(1) delta for deleting `row`: `next = prev + deleteDelta(row)`. */
  readonly deleteDelta: (row: Row) => A
  /** Exact O(1) delta for updating `before` to `after`: `next = prev + updateDelta(before, after)`. */
  readonly updateDelta: (before: Row, after: Row) => A
  /** Symbolic delta of `insert(row)` over `{ row }`, for unbounded Zone and Z3 proofs. */
  readonly symbolicInsertDelta: Expr.Expr<{ readonly row: Row }, number>
  /** Symbolic delta of `update(before -> after)` over `{ before, after }`. */
  readonly symbolicUpdateDelta: Expr.Expr<{ readonly before: Row; readonly after: Row }, number>
}

/** `Rows.sum`: the sum of an integer-valued contribution (`0` when empty). */
export interface Sum<Row, A extends number> extends GroupAggregate<Row, A> {
  readonly _tag: 'Sum'
}

/** `Rows.count`: the number of rows, or of rows whose predicate is true. */
export interface Count<Row> extends GroupAggregate<Row, number> {
  readonly _tag: 'Count'
  readonly predicate: Option.Option<Expr.Expr<Row, boolean>>
}

interface SemilatticeAggregate<Row, A, E> {
  readonly rowSchema: Schema.Codec<Row>
  readonly expr: Expr.Expr<Row, E>
  /** Evaluate over a concrete array of rows. */
  readonly evaluate: (rows: ReadonlyArray<Row>) => A
  /** O(1) fold of a newly inserted `row` into the current value. */
  readonly insertStep: (current: A, row: Row) => A
}

/** `Rows.min`: the smallest non-null value (`Option.none()` when there is none). */
export interface Min<Row> extends SemilatticeAggregate<Row, Option.Option<number>, number> {
  readonly _tag: 'Min'
}

/** `Rows.max`: the largest non-null value (`Option.none()` when there is none). */
export interface Max<Row> extends SemilatticeAggregate<Row, Option.Option<number>, number> {
  readonly _tag: 'Max'
}

/** `Rows.every`: true when no row's predicate is false or unknown (true when empty). */
export interface Every<Row> extends SemilatticeAggregate<Row, boolean, boolean> {
  readonly _tag: 'Every'
}

/** `Rows.any`: true when some row's predicate is true (false when empty). */
export interface Any<Row> extends SemilatticeAggregate<Row, boolean, boolean> {
  readonly _tag: 'Any'
}

export type Aggregate<Row> =
  | Sum<Row, number>
  | Count<Row>
  | Min<Row>
  | Max<Row>
  | Every<Row>
  | Any<Row>

const isIntegerAst = (ast: SchemaAST.AST): boolean => {
  if (SchemaAST.isNumber(ast)) return (ast.checks ?? []).some(isIntCheck)
  if (SchemaAST.isUnion(ast)) {
    const present = ast.types.filter(member => !SchemaAST.isNull(member))
    return present.length > 0 && present.every(isIntegerAst)
  }
  return false
}

const integerOps: ReadonlySet<string> = new Set<Node.CoreOpId>([
  'num.add',
  'num.sub',
  'num.mul',
  'num.neg',
])

/** True when every value `node` can take is a safe integer or null. */
const isIntegerValued = (node: Node.Node): boolean =>
  Node.$match(node, {
    Lit: ({ value }) => value === null || Number.isSafeInteger(value),
    Path: ({ ast }) => Option.match(ast, { onNone: () => false, onSome: isIntegerAst }),
    Call: ({ op, args }) =>
      op.id === 'str.len' ||
      op.id === 'arr.count' ||
      (integerOps.has(op.id) && args.every(isIntegerValued)),
    If: ({ then, otherwise }) => isIntegerValued(then) && isIntegerValued(otherwise),
    Match: ({ cases, otherwise }) =>
      cases.every(([, branch]) => isIntegerValued(branch)) &&
      Option.match(otherwise, { onNone: () => true, onSome: isIntegerValued }),
    Opaque: () => false,
    Rows: ({ fold, value }) =>
      fold === 'count' ||
      ((fold === 'sum' || fold === 'min' || fold === 'max') &&
        Option.exists(value, isIntegerValued)),
  })

const isMissing = (value: unknown): value is null | undefined =>
  value === null || value === undefined

/**
 * A total kept by deltas: exact only where the fold is commutative,
 * associative and invertible, and only over the domain each holds over, so a
 * contribution outside it is refused here, because its deltas would drift.
 */
const groupAggregate = <Row, A extends number>(
  fold: 'sum' | 'count',
  rowSchema: Schema.Top,
  contribution: Expr.Expr<Row, A>,
): GroupAggregate<Row, A> => {
  const { identity, commutative, associative, invertible } = foldProperties[fold]
  const domains = [commutative?.over, associative?.over, invertible?.over]
  if (identity === undefined || domains.includes(undefined)) {
    throw new Error(`[metakit] Rows.${fold}: its fold keeps no total by deltas`)
  }
  if (domains.includes('integers') && !isIntegerValued(contribution.node)) {
    throw new Error(
      `[metakit] Rows.${fold} needs an integer-valued contribution (a Schema.Int, Money or Decimal field, integer literals, and + - * over them), got ${Expr.show(contribution)}: its O(1) deltas are exact only over integers`,
    )
  }
  const zero = identity.value as A
  // SQL `SUM` skips a null; a missing contribution moves nothing.
  const valueOf = (row: Row): A => {
    const value = Expr.eval(contribution, row)
    return isMissing(value) ? zero : value
  }
  const liftTo = <Key extends string>(key: Key) =>
    Expr.lift(Path.field<{ readonly [K in Key]: Row }, Key>(key), contribution)
  return {
    identity: zero,
    rowSchema: rowSchema as unknown as Schema.Codec<Row>,
    contribution,
    evaluate: rows => rows.reduce((acc, row) => (acc + valueOf(row)) as A, zero),
    insertDelta: valueOf,
    deleteDelta: row => (0 - valueOf(row)) as A,
    updateDelta: (before, after) => (valueOf(after) - valueOf(before)) as A,
    symbolicInsertDelta: liftTo('row'),
    symbolicUpdateDelta: Num.sub(liftTo('after'), liftTo('before')),
  }
}

/**
 * The sum of an integer-valued contribution over the rows (`0` when empty; a
 * `null` contribution adds nothing). The contribution must read only
 * integer-valued fields (`Schema.Int`, `Money`, `Decimal`) and integer
 * literals through `+`, `-`, `*`, negation, `if` and `match`; anything else
 * is refused, because its deltas would drift.
 */
export const sum = <S extends Schema.Top, A extends number>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], A | null>,
): Sum<S['Type'], A> => ({
  _tag: 'Sum',
  ...groupAggregate('sum', rowSchema, wrap<S['Type'], A>(toNode(build(Path.forSchema(rowSchema))))),
})

/** The number of rows, or of rows whose predicate is true. */
export const count = <S extends Schema.Top>(
  rowSchema: S,
  predicate?: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], boolean | null>,
): Count<S['Type']> => {
  type Row = S['Type']
  const pred =
    predicate === undefined
      ? Option.none<Expr.Expr<Row, boolean>>()
      : Option.some(wrap<Row, boolean>(toNode(predicate(Path.forSchema(rowSchema)))))
  const contribution: Expr.Expr<Row, number> = Option.match(pred, {
    onNone: () => Expr.lit(1),
    onSome: p => Expr.when(p, { then: 1, else: 0 }),
  })
  return { _tag: 'Count', predicate: pred, ...groupAggregate('count', rowSchema, contribution) }
}

/**
 * Fold one value into an extremum: a `null` is skipped (as SQL `MIN`/`MAX`
 * skip it) and a `NaN` wins whatever the order, so the answer does not depend
 * on the order of the rows.
 */
const extremumStep =
  (better: (a: number, b: number) => boolean) =>
  (current: Option.Option<number>, value: number | null | undefined): Option.Option<number> => {
    if (isMissing(value)) return current
    return Option.match(current, {
      onNone: () => Option.some(value),
      // Nothing is better than a NaN, so once in it stays.
      onSome: prev => (Number.isNaN(value) || better(value, prev) ? Option.some(value) : current),
    })
  }

const extremum = <Row>(
  rowSchema: Schema.Top,
  expr: Expr.Expr<Row, number>,
  better: (a: number, b: number) => boolean,
): SemilatticeAggregate<Row, Option.Option<number>, number> => {
  const step = extremumStep(better)
  return {
    rowSchema: rowSchema as unknown as Schema.Codec<Row>,
    expr,
    evaluate: rows =>
      rows.reduce((acc, row) => step(acc, Expr.eval(expr, row)), Option.none<number>()),
    insertStep: (current, row) => step(current, Expr.eval(expr, row)),
  }
}

/** Semilattice aggregate: the smallest non-null value (`Option.none()` when there is none). */
export const min = <S extends Schema.Top>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], number | null>,
): Min<S['Type']> => ({
  _tag: 'Min',
  ...extremum(rowSchema, wrap(toNode(build(Path.forSchema(rowSchema)))), (a, b) => a < b),
})

/** Semilattice aggregate: the largest non-null value (`Option.none()` when there is none). */
export const max = <S extends Schema.Top>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], number | null>,
): Max<S['Type']> => ({
  _tag: 'Max',
  ...extremum(rowSchema, wrap(toNode(build(Path.forSchema(rowSchema)))), (a, b) => a > b),
})

const predicateAggregate = <Row>(
  rowSchema: Schema.Top,
  expr: Expr.Expr<Row, boolean>,
  fold: (current: boolean, holds: boolean) => boolean,
  empty: boolean,
): SemilatticeAggregate<Row, boolean, boolean> => {
  // Only `true` holds: an unknown predicate counts as false.
  const holds = (row: Row): boolean => Expr.eval(expr, row) === true
  return {
    rowSchema: rowSchema as unknown as Schema.Codec<Row>,
    expr,
    evaluate: rows => rows.reduce((acc, row) => fold(acc, holds(row)), empty),
    insertStep: (current, row) => fold(current, holds(row)),
  }
}

/**
 * Semilattice aggregate: true when every row's predicate is true (true when
 * empty). A row whose predicate is unknown counts as failing.
 */
export const every = <S extends Schema.Top>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], boolean | null>,
): Every<S['Type']> => ({
  _tag: 'Every',
  ...predicateAggregate(
    rowSchema,
    wrap(toNode(build(Path.forSchema(rowSchema)))),
    (acc, h) => acc && h,
    true,
  ),
})

/** Semilattice aggregate: true when some row's predicate is true (false when empty). */
export const any = <S extends Schema.Top>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], boolean | null>,
): Any<S['Type']> => ({
  _tag: 'Any',
  ...predicateAggregate(
    rowSchema,
    wrap(toNode(build(Path.forSchema(rowSchema)))),
    (acc, h) => acc || h,
    false,
  ),
})
