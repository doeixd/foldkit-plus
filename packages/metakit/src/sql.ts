/**
 * SQL text for Postgres and SQLite (`metakit/sql`): a Schema's rules as a
 * `CHECK`, a boolean expression as a `WHERE` predicate with its parameters,
 * and a transition as a guarded `UPDATE`.
 *
 * The lowering itself is `sqlLowering.ts`, which `metakit/drizzle` renders
 * too; this module renders its pieces as text.
 */
import { Result } from 'effect'
import type { Schema } from 'effect'
import type * as Expr from './expr.js'
import {
  bound,
  columnNames,
  inlineLiteral,
  lowerCheck,
  lowerUpdate,
  lowerWhere,
  SqlPiece,
  type Sql,
  type SqlDialect,
  type SqlUnsupportedError,
} from './sqlLowering.js'
import type { Refused, Transition } from './transition.js'

export {
  sqlOps,
  SqlUnsupportedError,
  type SqlContext,
  type SqlDialect,
  type SqlLowerer,
} from './sqlLowering.js'

export interface SqlFragment {
  readonly text: string
  readonly params: ReadonlyArray<unknown>
}

/** How a path under the row becomes SQL for its column; the default quotes its segments joined by `_`. */
export type ColumnName = (segments: ReadonlyArray<string>) => string

export interface SqlOptions {
  readonly dialect?: SqlDialect
  /**
   * The slice of the environment that is the row: a path under it is a
   * column, any other must be given in `env`. Default `['row']`; `[]` reads
   * every path as a column.
   */
  readonly rowPrefix?: ReadonlyArray<string>
  readonly column?: ColumnName
  readonly env?: Readonly<Record<string, unknown>>
}

const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`

const defaultColumn: ColumnName = segments => quoteIdent(segments.join('_'))

/** Renders pieces as text. One per statement: its parameters number in the order written. */
const renderer = (options: {
  readonly dialect: SqlDialect
  readonly column: ColumnName
  readonly inline: boolean
}) => {
  const params: Array<unknown> = []
  const column = columnNames(options.column)
  const render = (sql: Sql): Result.Result<string, SqlUnsupportedError> => {
    let text = ''
    for (const piece of sql) {
      const part = SqlPiece.$match(piece, {
        Text: ({ text }) => Result.succeed(text),
        Column: ({ segments }) => column(segments),
        Value: ({ value }) => {
          if (options.inline) return inlineLiteral(value)
          params.push(bound(value, options.dialect))
          return Result.succeed(options.dialect === 'postgres' ? `$${params.length}` : '?')
        },
      })
      if (Result.isFailure(part)) return part
      text += part.success
    }
    return Result.succeed(text)
  }
  return { params, column, render }
}

/**
 * Every rule of `schema` as a SQL `CHECK (...)` clause. The check fails where
 * a rule is unknown of a null, as the Schema refuses that value. Literals are
 * written into the text, since DDL takes no parameters.
 */
export const toCheck = <S extends Schema.Top>(
  schema: S,
  options?: { readonly dialect?: SqlDialect; readonly column?: ColumnName },
): Result.Result<string, SqlUnsupportedError> => {
  const dialect = options?.dialect ?? 'postgres'
  const { render } = renderer({ dialect, column: options?.column ?? defaultColumn, inline: true })
  return Result.map(Result.flatMap(lowerCheck(schema, dialect), render), text => `CHECK (${text})`)
}

/** A boolean `Expr` as a parameterized SQL `WHERE` predicate, which keeps a row only where it is true. */
export const toWhere = <Env>(
  expr: Expr.Expr<Env, boolean | null>,
  options?: SqlOptions,
): Result.Result<SqlFragment, SqlUnsupportedError> => {
  const dialect = options?.dialect ?? 'postgres'
  const { params, render } = renderer({
    dialect,
    column: options?.column ?? defaultColumn,
    inline: false,
  })
  const lowered = lowerWhere(expr, {
    dialect,
    rowPrefix: options?.rowPrefix ?? ['row'],
    env: options?.env,
  })
  return Result.map(Result.flatMap(lowered, render), text => ({ text, params }))
}

/**
 * A `Transition` and one `input` as a guarded, parameterized SQL `UPDATE` of
 * `table`: it writes only the rows the guard holds of. `whereId` narrows it
 * to the row whose key column holds a value. An input the transition's input
 * Schema refuses is `Refused`.
 */
export const toUpdate = <State, Input, Emit>(
  table: string,
  transition: Transition<State, Input, Emit>,
  input: Input,
  options?: {
    readonly dialect?: SqlDialect
    readonly column?: ColumnName
    readonly whereId?: {
      readonly [K in keyof State & string]: { readonly column: K; readonly value: State[K] }
    }[keyof State & string]
  },
): Result.Result<SqlFragment, SqlUnsupportedError | Refused> => {
  const dialect = options?.dialect ?? 'postgres'
  const { params, column, render } = renderer({
    dialect,
    column: options?.column ?? defaultColumn,
    inline: false,
  })
  return Result.flatMap(lowerUpdate(transition, input, dialect), ({ sets, when }) => {
    const assignments: Array<string> = []
    for (const [target, value] of sets) {
      const name = column(target)
      if (Result.isFailure(name)) return Result.fail(name.failure)
      const rhs = render(value)
      if (Result.isFailure(rhs)) return Result.fail(rhs.failure)
      assignments.push(`${name.success} = ${rhs.success}`)
    }
    const key = options?.whereId
    const where: Sql =
      key === undefined
        ? when
        : [
            SqlPiece.Column({ segments: [key.column] }),
            SqlPiece.Text({ text: ' = ' }),
            SqlPiece.Value({ value: key.value }),
            SqlPiece.Text({ text: ' AND ' }),
            ...when,
          ]
    return Result.map(render(where), predicate => ({
      text: `UPDATE ${quoteIdent(table)} SET ${assignments.join(', ')} WHERE ${predicate}`,
      params,
    }))
  })
}
