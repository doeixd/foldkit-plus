/**
 * `metakit/aggregates/sql`: compile a `metakit/aggregates` aggregate to one SQL
 * aggregate expression for Postgres or SQLite, giving the answer the in-memory
 * `evaluate` gives. Kept apart from `metakit/aggregates` so a page that
 * evaluates aggregates carries no SQL lowering.
 *
 * - `sum` is `COALESCE(SUM(x), 0)`, and `min` and `max` are `MIN(x)` and
 *   `MAX(x)`, which skip nulls. Postgres casts each to `DOUBLE PRECISION`,
 *   which every driver reads as a number and which is exact over the safe
 *   integer range (a `bigint` reaches most drivers as text).
 * - `count` is `COUNT(*)`, or a sum of `CASE WHEN p THEN 1 ELSE 0 END`; Postgres
 *   casts it to `INTEGER`.
 * - `every` counts an unknown predicate as failing on both dialects
 *   (`coalesce(p, false)`; Postgres's `BOOL_AND` alone would skip it), and `any`
 *   as not holding. SQLite answers `0` or `1`.
 */
import { Match, Option, Result } from 'effect'
import type { Aggregate } from './aggregates.js'
import type { Expr } from './path.js'
import * as Sql from './sql.js'

export interface AggregateSqlOptions {
  readonly dialect?: Sql.SqlDialect
  readonly column?: (segments: ReadonlyArray<string>) => string
}

/** Compile `aggregate` to a SQL aggregate expression over the rows' columns. */
export const toSql = <Row>(
  aggregate: Aggregate<Row>,
  options?: AggregateSqlOptions,
): Result.Result<Sql.SqlFragment, Sql.SqlUnsupportedError> => {
  const postgres = (options?.dialect ?? 'postgres') === 'postgres'
  const around = (
    expr: Expr<Row, unknown>,
    text: (inner: string) => string,
  ): Result.Result<Sql.SqlFragment, Sql.SqlUnsupportedError> =>
    Result.map(
      // `toWhere` lowers any expression; its name reflects its usual caller.
      Sql.toWhere(expr as Expr<Row, boolean>, {
        rowPrefix: [],
        ...(options?.dialect !== undefined ? { dialect: options.dialect } : {}),
        ...(options?.column !== undefined ? { column: options.column } : {}),
      }),
      fragment => ({ text: text(fragment.text), params: fragment.params }),
    )
  const counted = (inner: string): string => {
    const total = `COALESCE(SUM(CASE WHEN ${inner} THEN 1 ELSE 0 END), 0)`
    return postgres ? `${total}::INTEGER` : total
  }
  return Match.valueTags(aggregate, {
    Sum: ({ contribution }) =>
      around(contribution, x =>
        postgres ? `COALESCE(SUM(${x}), 0)::DOUBLE PRECISION` : `COALESCE(SUM(${x}), 0)`,
      ),
    Count: ({ predicate }) =>
      Option.match(predicate, {
        onNone: () =>
          Result.succeed({ text: postgres ? 'COUNT(*)::INTEGER' : 'COUNT(*)', params: [] }),
        onSome: p => around(p, counted),
      }),
    Min: ({ expr }) => around(expr, x => (postgres ? `MIN(${x})::DOUBLE PRECISION` : `MIN(${x})`)),
    Max: ({ expr }) => around(expr, x => (postgres ? `MAX(${x})::DOUBLE PRECISION` : `MAX(${x})`)),
    Every: ({ expr }) =>
      around(expr, x =>
        postgres
          ? `COALESCE(BOOL_AND(COALESCE(${x}, FALSE)), TRUE)`
          : `COALESCE(MIN(CASE WHEN ${x} THEN 1 ELSE 0 END), 1)`,
      ),
    Any: ({ expr }) =>
      around(expr, x =>
        postgres
          ? `COALESCE(BOOL_OR(${x}), FALSE)`
          : `COALESCE(MAX(CASE WHEN ${x} THEN 1 ELSE 0 END), 0)`,
      ),
  })
}
