/**
 * Cross-record Aggregates (`metakit/aggregates`) tagged by algebraic structure:
 *
 * - **Abelian Groups** (`algebra: 'group'` — `Rows.sum`, `Rows.count`):
 *   Invertible, so insert/update/delete yields an exact $O(1)$ delta
 *   ($\Delta = \text{new} - \text{old}$). This unlocks both $O(1)$ incremental
 *   view maintenance (IVM) and **unbounded** static proofs over any number of
 *   child rows via `Rows.delta` + `Prove.transition`.
 * - **Commutative Monoids / Semilattices** (`algebra: 'semilattice'` —
 *   `Rows.min`, `Rows.max`, `Rows.every`, `Rows.any`):
 *   Non-invertible, so inserts are $O(1)$ while deletes/updates of the
 *   extremum require rescanning remaining rows (`requiresRescanOnDelete: true`).
 */
import { Option, Result } from 'effect'
import type { Schema } from 'effect'
import * as Expr from './expr.js'
import { toNode, wrap, type ExprInput } from './ops/core.js'
import * as Num from './ops/num.js'
import * as Path from './path.js'
import type { PathAccessor } from './path.js'
import * as Sql from './sql.js'

export type AggregateAlgebra = 'group' | 'semilattice'

export type AggregateKind = 'sum' | 'count' | 'min' | 'max' | 'every' | 'any'

export interface GroupAggregate<Row, A extends number> {
  readonly _tag: 'Aggregate'
  readonly kind: 'sum' | 'count'
  readonly algebra: 'group'
  readonly requiresRescanOnDelete: false
  readonly identity: A
  readonly rowSchema: Schema.Codec<Row>
  /** Per-row contribution expression (for `count`, `1` or `if pred then 1 else 0`). */
  readonly contribution: Expr.Expr<Row, number>
  /** Evaluate the aggregate over a concrete array of rows. */
  readonly evaluate: (rows: ReadonlyArray<Row>) => A
  /** Exact $O(1)$ IVM delta for inserting `row`: `next = prev + insertDelta(row)`. */
  readonly insertDelta: (row: Row) => number
  /** Exact $O(1)$ IVM delta for deleting `row`: `next = prev + deleteDelta(row)`. */
  readonly deleteDelta: (row: Row) => number
  /** Exact $O(1)$ IVM delta for updating `before` -> `after`: `next = prev + updateDelta(before, after)`. */
  readonly updateDelta: (before: Row, after: Row) => number
  /** Symbolic delta expression for `insert(row)` over `{ row }` (for unbounded Zone/Z3 proofs). */
  readonly symbolicInsertDelta: Expr.Expr<{ readonly row: Row }, number>
  /** Symbolic delta expression for `update(before -> after)` over `{ before, after }`. */
  readonly symbolicUpdateDelta: Expr.Expr<{ readonly before: Row; readonly after: Row }, number>
  /** Compile to a SQL aggregate expression (e.g. `COALESCE(SUM("amount"), 0)`). */
  readonly toSql: (options?: {
    readonly dialect?: Sql.SqlDialect
    readonly column?: (segments: ReadonlyArray<string>) => string
  }) => Result.Result<Sql.SqlFragment, Sql.SqlUnsupportedError>
}

export interface SemilatticeAggregate<Row, A> {
  readonly _tag: 'Aggregate'
  readonly kind: 'min' | 'max' | 'every' | 'any'
  readonly algebra: 'semilattice'
  readonly requiresRescanOnDelete: true
  readonly rowSchema: Schema.Codec<Row>
  readonly expr: Expr.Expr<Row, unknown>
  /** Evaluate over a concrete array of rows (`Option.none()` for `min`/`max` on empty). */
  readonly evaluate: (rows: ReadonlyArray<Row>) => A
  /** Exact $O(1)$ IVM fold for inserting a new `row` into an existing aggregate value. */
  readonly insertStep: (current: A, row: Row) => A
  /** Compile to a SQL aggregate expression (`MIN(...)`, `MAX(...)`, `BOOL_AND(...)`, `BOOL_OR(...)`). */
  readonly toSql: (options?: {
    readonly dialect?: Sql.SqlDialect
    readonly column?: (segments: ReadonlyArray<string>) => string
  }) => Result.Result<Sql.SqlFragment, Sql.SqlUnsupportedError>
}

export type Aggregate<Row, A> = GroupAggregate<Row, A & number> | SemilatticeAggregate<Row, A>

const lowerRowExpr = <Row>(
  expr: Expr.Expr<Row, unknown>,
  options?: {
    readonly dialect?: Sql.SqlDialect
    readonly column?: (segments: ReadonlyArray<string>) => string
  },
): Result.Result<Sql.SqlFragment, Sql.SqlUnsupportedError> =>
  Sql.toWhere(expr as Expr.Expr<Row, boolean>, {
    rowPrefix: [],
    ...(options?.dialect !== undefined ? { dialect: options.dialect } : {}),
    ...(options?.column !== undefined ? { column: options.column } : {}),
  })

/** Abelian group aggregate: `sum` of a numeric expression over child rows (`0` when empty). */
export const sum = <S extends Schema.Top>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], number>,
): GroupAggregate<S['Type'], number> => {
  type Row = S['Type']
  const contribution = wrap<Row, number>(toNode(build(Path.forSchema(rowSchema))))
  const symbolicInsertDelta = Expr.lift(
    Path.field<{ readonly row: Row }, 'row'>('row'),
    contribution,
  )
  const beforeContrib = Expr.lift(
    Path.field<{ readonly before: Row; readonly after: Row }, 'before'>('before'),
    contribution,
  )
  const afterContrib = Expr.lift(
    Path.field<{ readonly before: Row; readonly after: Row }, 'after'>('after'),
    contribution,
  )
  const symbolicUpdateDelta = Num.sub(afterContrib, beforeContrib)

  return {
    _tag: 'Aggregate',
    kind: 'sum',
    algebra: 'group',
    requiresRescanOnDelete: false,
    identity: 0,
    rowSchema: rowSchema as unknown as Schema.Codec<Row>,
    contribution,
    evaluate: rows => rows.reduce((acc, r) => acc + Expr.eval(contribution, r), 0),
    insertDelta: row => Expr.eval(contribution, row),
    deleteDelta: row => -Expr.eval(contribution, row),
    updateDelta: (before, after) =>
      Expr.eval(contribution, after) - Expr.eval(contribution, before),
    symbolicInsertDelta,
    symbolicUpdateDelta,
    toSql: options =>
      Result.map(lowerRowExpr(contribution, options), frag => ({
        text: `COALESCE(SUM(${frag.text}), 0)`,
        params: frag.params,
      })),
  }
}

/** Abelian group aggregate: `count` of rows (optionally matching a predicate). */
export const count = <S extends Schema.Top>(
  rowSchema: S,
  predicate?: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], boolean>,
): GroupAggregate<S['Type'], number> => {
  type Row = S['Type']
  const pred =
    predicate === undefined
      ? Option.none<Expr.Expr<Row, boolean>>()
      : Option.some(wrap<Row, boolean>(toNode(predicate(Path.forSchema(rowSchema)))))
  const contribution: Expr.Expr<Row, number> = Option.match(pred, {
    onNone: () => Expr.lit(1),
    onSome: p => Expr.when(p, { then: 1, else: 0 }),
  })
  const symbolicInsertDelta = Expr.lift(
    Path.field<{ readonly row: Row }, 'row'>('row'),
    contribution,
  )
  const beforeContrib = Expr.lift(
    Path.field<{ readonly before: Row; readonly after: Row }, 'before'>('before'),
    contribution,
  )
  const afterContrib = Expr.lift(
    Path.field<{ readonly before: Row; readonly after: Row }, 'after'>('after'),
    contribution,
  )
  const symbolicUpdateDelta = Num.sub(afterContrib, beforeContrib)

  return {
    _tag: 'Aggregate',
    kind: 'count',
    algebra: 'group',
    requiresRescanOnDelete: false,
    identity: 0,
    rowSchema: rowSchema as unknown as Schema.Codec<Row>,
    contribution,
    evaluate: rows => rows.reduce((acc, r) => acc + Expr.eval(contribution, r), 0),
    insertDelta: row => Expr.eval(contribution, row),
    deleteDelta: row => -Expr.eval(contribution, row),
    updateDelta: (before, after) =>
      Expr.eval(contribution, after) - Expr.eval(contribution, before),
    symbolicInsertDelta,
    symbolicUpdateDelta,
    toSql: options =>
      Option.match(pred, {
        onNone: () => Result.succeed({ text: 'COUNT(*)::INTEGER', params: [] }),
        onSome: p =>
          Result.map(lowerRowExpr(p, options), frag => ({
            text:
              options?.dialect === 'sqlite'
                ? `COALESCE(SUM(CASE WHEN ${frag.text} THEN 1 ELSE 0 END), 0)`
                : `COALESCE(SUM(CASE WHEN ${frag.text} THEN 1 ELSE 0 END), 0)::INTEGER`,
            params: frag.params,
          })),
      }),
  }
}

/** Semilattice aggregate: `min` of a numeric expression (`Option.none()` when empty). */
export const min = <S extends Schema.Top>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], number>,
): SemilatticeAggregate<S['Type'], Option.Option<number>> => {
  type Row = S['Type']
  const expr = wrap<Row, number>(toNode(build(Path.forSchema(rowSchema))))
  return {
    _tag: 'Aggregate',
    kind: 'min',
    algebra: 'semilattice',
    requiresRescanOnDelete: true,
    rowSchema: rowSchema as unknown as Schema.Codec<Row>,
    expr,
    evaluate: rows => {
      if (rows.length === 0) return Option.none()
      let best = Expr.eval(expr, rows[0]!)
      for (let i = 1; i < rows.length; i++) {
        const v = Expr.eval(expr, rows[i]!)
        if (v < best) best = v
      }
      return Option.some(best)
    },
    insertStep: (current, row) => {
      const v = Expr.eval(expr, row)
      return Option.match(current, {
        onNone: () => Option.some(v),
        onSome: prev => Option.some(v < prev ? v : prev),
      })
    },
    toSql: options =>
      Result.map(lowerRowExpr(expr, options), frag => ({
        text: `MIN(${frag.text})`,
        params: frag.params,
      })),
  }
}

/** Semilattice aggregate: `max` of a numeric expression (`Option.none()` when empty). */
export const max = <S extends Schema.Top>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], number>,
): SemilatticeAggregate<S['Type'], Option.Option<number>> => {
  type Row = S['Type']
  const expr = wrap<Row, number>(toNode(build(Path.forSchema(rowSchema))))
  return {
    _tag: 'Aggregate',
    kind: 'max',
    algebra: 'semilattice',
    requiresRescanOnDelete: true,
    rowSchema: rowSchema as unknown as Schema.Codec<Row>,
    expr,
    evaluate: rows => {
      if (rows.length === 0) return Option.none()
      let best = Expr.eval(expr, rows[0]!)
      for (let i = 1; i < rows.length; i++) {
        const v = Expr.eval(expr, rows[i]!)
        if (v > best) best = v
      }
      return Option.some(best)
    },
    insertStep: (current, row) => {
      const v = Expr.eval(expr, row)
      return Option.match(current, {
        onNone: () => Option.some(v),
        onSome: prev => Option.some(v > prev ? v : prev),
      })
    },
    toSql: options =>
      Result.map(lowerRowExpr(expr, options), frag => ({
        text: `MAX(${frag.text})`,
        params: frag.params,
      })),
  }
}

/** Semilattice aggregate: `every` (true when every row satisfies the predicate; vacuously true on empty). */
export const every = <S extends Schema.Top>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], boolean>,
): SemilatticeAggregate<S['Type'], boolean> => {
  type Row = S['Type']
  const expr = wrap<Row, boolean>(toNode(build(Path.forSchema(rowSchema))))
  return {
    _tag: 'Aggregate',
    kind: 'every',
    algebra: 'semilattice',
    requiresRescanOnDelete: true,
    rowSchema: rowSchema as unknown as Schema.Codec<Row>,
    expr,
    evaluate: rows => rows.every(r => Expr.eval(expr, r)),
    insertStep: (current, row) => current && Expr.eval(expr, row),
    toSql: options =>
      Result.map(lowerRowExpr(expr, options), frag => ({
        text:
          options?.dialect === 'sqlite'
            ? `COALESCE(MIN(CASE WHEN ${frag.text} THEN 1 ELSE 0 END), 1)`
            : `COALESCE(BOOL_AND(${frag.text}), TRUE)`,
        params: frag.params,
      })),
  }
}

/** Semilattice aggregate: `any` (true when at least one row satisfies the predicate; false on empty). */
export const any = <S extends Schema.Top>(
  rowSchema: S,
  build: ($: PathAccessor<S['Type'], S['Type']>) => ExprInput<S['Type'], boolean>,
): SemilatticeAggregate<S['Type'], boolean> => {
  type Row = S['Type']
  const expr = wrap<Row, boolean>(toNode(build(Path.forSchema(rowSchema))))
  return {
    _tag: 'Aggregate',
    kind: 'any',
    algebra: 'semilattice',
    requiresRescanOnDelete: true,
    rowSchema: rowSchema as unknown as Schema.Codec<Row>,
    expr,
    evaluate: rows => rows.some(r => Expr.eval(expr, r)),
    insertStep: (current, row) => current || Expr.eval(expr, row),
    toSql: options =>
      Result.map(lowerRowExpr(expr, options), frag => ({
        text:
          options?.dialect === 'sqlite'
            ? `COALESCE(MAX(CASE WHEN ${frag.text} THEN 1 ELSE 0 END), 0)`
            : `COALESCE(BOOL_OR(${frag.text}), FALSE)`,
        params: frag.params,
      })),
  }
}
