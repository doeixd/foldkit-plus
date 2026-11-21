/**
 * Drizzle `SQL` (`metakit/drizzle`, optional peer `drizzle-orm`): a Schema's
 * rules for `check(name, sql)`, a boolean expression for `.where(...)`, and a
 * transition as `{ set, where }` for `db.update(table)`.
 *
 * The lowering is `sqlLowering.ts`, the one `metakit/sql` renders as text;
 * this module renders its pieces with the table's own columns and Drizzle's
 * parameters.
 */
import { getTableColumns, sql, type SQL, type SQLChunk, type Table } from 'drizzle-orm'
import { Result } from 'effect'
import type { Schema } from 'effect'
import type * as Expr from './expr.js'
import {
  bound,
  columnNames,
  foreignSql,
  type ForeignSql,
  inlineLiteral,
  lowerCheck,
  lowerUpdate,
  lowerWhere,
  SqlPiece,
  SqlUnsupportedError,
  type Sql,
  type SqlDialect,
} from './sqlLowering.js'
import type { Refused, Transition } from './transition.js'

/**
 * The Drizzle `SQL` of each foreign operation, by id, from its arguments
 * rendered as Drizzle `SQL`. A foreign call with no entry of its version is
 * refused by name.
 */
export type ForeignDrizzle = Readonly<Record<string, ForeignSql<SQL>>>

export interface DrizzleOptions {
  readonly dialect?: SqlDialect
  /** As `SqlOptions.rowPrefix`: default `['row']`, and `[]` reads every path as a column. */
  readonly rowPrefix?: ReadonlyArray<string>
  readonly env?: Readonly<Record<string, unknown>>
  readonly foreign?: ForeignDrizzle
}

/** Renders pieces as Drizzle `SQL`, reading a path as the table's column of that key (segments joined by `_`). */
const renderer = (
  table: Table,
  options: {
    readonly dialect: SqlDialect
    readonly inline: boolean
    readonly foreign: ForeignDrizzle
  },
) => {
  const columns: Readonly<Record<string, SQLChunk>> = getTableColumns(table)
  const key = columnNames(segments => segments.join('_'))
  const column = (segments: ReadonlyArray<string>): Result.Result<string, SqlUnsupportedError> =>
    Result.flatMap(key(segments), name =>
      Object.hasOwn(columns, name)
        ? Result.succeed(name)
        : Result.fail(new SqlUnsupportedError({ reason: `table has no column "${name}"` })),
    )
  const render = (pieces: Sql): Result.Result<SQL, SqlUnsupportedError> => {
    const chunks: Array<SQLChunk> = []
    for (const piece of pieces) {
      const chunk = SqlPiece.$match(piece, {
        Text: ({ text }): Result.Result<SQLChunk, SqlUnsupportedError> =>
          Result.succeed(sql.raw(text)),
        Column: ({ segments }) => Result.map(column(segments), name => columns[name]!),
        Value: ({ value }) =>
          options.inline
            ? Result.map(inlineLiteral(value), text => sql.raw(text))
            : Result.succeed(sql`${bound(value, options.dialect)}`),
        Foreign: ({ op, args }) =>
          Result.flatMap(foreignSql(options.foreign, op), entry =>
            Result.map(Result.all(args.map(render)), rendered =>
              entry.sql(rendered, options.dialect),
            ),
          ),
      })
      if (Result.isFailure(chunk)) return Result.fail(chunk.failure)
      chunks.push(chunk.success)
    }
    return Result.succeed(sql.join(chunks))
  }
  return { column, render }
}

/**
 * Every rule of `schema` as a Drizzle `SQL` expression for `check(name, sql)`.
 * It fails where a rule is unknown of a null, as the Schema refuses that
 * value; literals are written into the text.
 */
export const toCheck = <S extends Schema.Top>(
  schema: S,
  table: Table,
  options?: { readonly dialect?: SqlDialect },
): Result.Result<SQL, SqlUnsupportedError> => {
  const dialect = options?.dialect ?? 'postgres'
  return Result.flatMap(
    lowerCheck(schema, dialect),
    renderer(table, { dialect, inline: true, foreign: {} }).render,
  )
}

/** A boolean `Expr` as a Drizzle `SQL` predicate for `.where(...)`, which keeps a row only where it is true. */
export const toWhere = <Env>(
  expr: Expr.Expr<Env, boolean | null>,
  table: Table,
  options?: DrizzleOptions,
): Result.Result<SQL, SqlUnsupportedError> => {
  const dialect = options?.dialect ?? 'postgres'
  return Result.flatMap(
    lowerWhere(expr, { dialect, rowPrefix: options?.rowPrefix ?? ['row'], env: options?.env }),
    renderer(table, { dialect, inline: false, foreign: options?.foreign ?? {} }).render,
  )
}

/**
 * A `Transition` and one `input` as `{ set, where }` for
 * `db.update(table).set(set).where(where)`, `set` keyed by the table's column
 * keys. An input the transition's input Schema refuses is `Refused`.
 */
export const toUpdate = <State, Input, Emit>(
  transition: Transition<State, Input, Emit>,
  input: Input,
  table: Table,
  options?: { readonly dialect?: SqlDialect; readonly foreign?: ForeignDrizzle },
): Result.Result<
  { readonly set: Readonly<Record<string, SQL>>; readonly where: SQL },
  SqlUnsupportedError | Refused
> => {
  const dialect = options?.dialect ?? 'postgres'
  const { column, render } = renderer(table, {
    dialect,
    inline: false,
    foreign: options?.foreign ?? {},
  })
  return Result.flatMap(lowerUpdate(transition, input, dialect), ({ sets, when }) => {
    const set: Record<string, SQL> = {}
    for (const [target, value] of sets) {
      const name = column(target)
      if (Result.isFailure(name)) return Result.fail(name.failure)
      const rhs = render(value)
      if (Result.isFailure(rhs)) return Result.fail(rhs.failure)
      set[name.success] = rhs.success
    }
    return Result.map(render(when), where => ({ set, where }))
  })
}
