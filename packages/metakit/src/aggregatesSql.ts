/**
 * `@doeixd/metakit/aggregates/sql`: compile a `@doeixd/metakit/aggregates` aggregate to one SQL
 * aggregate expression for Postgres or SQLite. Kept apart from
 * `@doeixd/metakit/aggregates` so a page that
 * evaluates aggregates carries no SQL lowering.
 *
 * - `sum` accumulates integers exactly and returns SQL NULL when the final
 *   total is outside JavaScript's safe integer range. SQLite needs bounds
 *   that keep every intermediate sum within its integer accumulator.
 * - `min` and `max` skip nulls. Postgres casts each to `DOUBLE PRECISION`.
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
  /** Required for SQLite sums. The caller must enforce both bounds per aggregate group. */
  readonly sqliteSum?: {
    readonly maxRows: number
    readonly maxAbsContribution: number
  }
}

const SQLITE_MAX_INTEGER = (1n << 63n) - 1n
const MAX_SAFE = Number.MAX_SAFE_INTEGER

/** Compile `aggregate` to a SQL aggregate expression over the rows' columns. */
export const toSql = <Row>(
  aggregate: Aggregate<Row>,
  options?: AggregateSqlOptions,
): Result.Result<Sql.SqlFragment, Sql.SqlUnsupportedError> => {
  const postgres = (options?.dialect ?? 'postgres') === 'postgres'
  const lower = (expr: Expr<Row, unknown>) =>
    // `toWhere` lowers any expression; its name reflects its usual caller.
    Sql.toWhere(expr as Expr<Row, boolean>, {
      rowPrefix: [],
      ...(options?.dialect !== undefined ? { dialect: options.dialect } : {}),
      ...(options?.column !== undefined ? { column: options.column } : {}),
    })
  const around = (
    expr: Expr<Row, unknown>,
    text: (inner: string) => string,
  ): Result.Result<Sql.SqlFragment, Sql.SqlUnsupportedError> =>
    Result.map(lower(expr), fragment => ({ text: text(fragment.text), params: fragment.params }))
  const counted = (inner: string): string => {
    const total = `COALESCE(SUM(CASE WHEN ${inner} THEN 1 ELSE 0 END), 0)`
    return postgres ? `${total}::INTEGER` : total
  }
  return Match.valueTags(aggregate, {
    Sum: ({ contribution }) => {
      if (!postgres) {
        const bounds = options?.sqliteSum
        if (
          bounds === undefined ||
          !Number.isSafeInteger(bounds.maxRows) ||
          bounds.maxRows < 0 ||
          !Number.isSafeInteger(bounds.maxAbsContribution) ||
          bounds.maxAbsContribution < 0 ||
          BigInt(bounds.maxRows) * BigInt(bounds.maxAbsContribution) > SQLITE_MAX_INTEGER
        ) {
          return Result.fail(
            new Sql.SqlUnsupportedError({
              reason:
                'SQLite sum needs sqliteSum bounds whose product fits a signed 64-bit integer',
            }),
          )
        }
      }
      return Result.map(lower(contribution), ({ text, params }) => {
        const total = `COALESCE(SUM(CAST(${text} AS ${postgres ? 'NUMERIC' : 'INTEGER'})), 0)`
        const value = postgres ? `${total}::DOUBLE PRECISION` : total
        return {
          text: `(CASE WHEN ${total} BETWEEN ${-MAX_SAFE} AND ${MAX_SAFE} THEN ${value} END)`,
          // PostgreSQL reuses its numbered placeholders. SQLite binds each occurrence.
          params: postgres ? params : [...params, ...params],
        }
      })
    },
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
