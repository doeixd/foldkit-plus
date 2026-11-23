/**
 * SQL text for Postgres and SQLite (`metakit/sql`): a Schema's rules as a
 * `CHECK`, a boolean expression as a `WHERE` predicate with its parameters,
 * and a transition as a guarded `UPDATE`.
 *
 * The lowering itself is `sqlLowering.ts`, which `metakit/drizzle` renders
 * too; this module renders its pieces as text.
 */
import { Option, Result } from 'effect'
import type { Schema } from 'effect'
import type * as Expr from './expr.js'
import * as Node from './node.js'
import { isForeignLowerings, type ForeignLowerings } from './operationSql.js'
import { literal, SqlPiece, SqlUnsupportedError, type Sql, type SqlDialect } from './sqlLowering.js'
import { lowerCheck, lowerUpdate, lowerWhere } from './sqlStatements.js'
import {
  bound,
  columnNames,
  foreignSql,
  inlineLiteral,
  relatedSubquery,
  relationSql,
  type ForeignSql,
} from './sqlRender.js'
import type { Refused, Transition } from './transition.js'

export {
  lowerNode,
  sqlOps,
  SqlPiece,
  SqlUnsupportedError,
  type RelatedFold,
  type Sql,
  type SqlContext,
  type SqlDialect,
  type SqlLowerer,
} from './sqlLowering.js'
export { relatedSubquery, type ForeignSql } from './sqlRender.js'

/**
 * Where the rows related to a row through a relation are: their table, the
 * column of it that holds the id of the row they point at, and the column of
 * the row's own table that id is (default `id`).
 */
export interface RelationTable {
  readonly table: string
  readonly foreignKey: string
  readonly key?: string
}

/** The table of each relation a `Rows` node over related rows names, by relation. */
export type RelationTables = Readonly<Record<string, RelationTable>>

/**
 * The SQL of each foreign operation, by `id@version` (`Node.foreignName`):
 * pieces from the lowered arguments, which this module renders with the
 * rest. A foreign call with no entry is refused by that name.
 */
export type ForeignSqlTable = Readonly<Record<string, ForeignSql<Sql>>>

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
  readonly foreign?: ForeignSqlTable | ForeignLowerings
  /** The table of the row the predicate is asked of, which a subquery over its related rows names. */
  readonly table?: string
  readonly relations?: RelationTables
}

const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`

const defaultColumn: ColumnName = segments => quoteIdent(segments.join('_'))

/** Renders pieces as text. One per statement: its parameters number in the order written. */
const renderer = (options: {
  readonly dialect: SqlDialect
  readonly column: ColumnName
  readonly inline: boolean
  readonly foreign: ForeignSqlTable | ForeignLowerings
  readonly table?: string | undefined
  readonly relations?: RelationTables | undefined
}) => {
  const params: Array<unknown> = []
  const column = columnNames(options.column)
  const render = (
    sql: Sql,
    related?: RelationTable,
  ): Result.Result<string, SqlUnsupportedError> => {
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
        // Pieces, not text: a parameter keeps its place however the entry orders the arguments.
        Foreign: ({ op, args }) => {
          const table = options.foreign
          if (isForeignLowerings(table)) {
            return Result.flatMap(Result.all(args.map(arg => render(arg, related))), rendered =>
              table.renderCall(options.dialect, op, rendered, parts => parts.join('')),
            )
          }
          return Result.flatMap(foreignSql(table, op), entry =>
            render(entry.sql(args, options.dialect), related),
          )
        },
        Each: ({ segments }) =>
          related === undefined
            ? Result.fail(
                new SqlUnsupportedError({ reason: 'a related row is read outside its rows' }),
              )
            : Result.succeed(`${quoteIdent(related.table)}.${options.column(segments)}`),
        Rows: piece => renderRows(piece, render),
      })
      if (Result.isFailure(part)) return part
      text += part.success
    }
    return Result.succeed(text)
  }
  const renderRows = (
    piece: Extract<SqlPiece, { readonly _tag: 'Rows' }>,
    render: (sql: Sql, related?: RelationTable) => Result.Result<string, SqlUnsupportedError>,
  ): Result.Result<string, SqlUnsupportedError> => {
    const outer = options.table
    if (piece.of.length > 0) {
      return Result.fail(
        new SqlUnsupportedError({
          reason: `rows related to a row reached through "${piece.of.join('.')}"`,
        }),
      )
    }
    if (outer === undefined) {
      return Result.fail(
        new SqlUnsupportedError({
          reason: `rows related through ${piece.relation} need the table they point at`,
        }),
      )
    }
    return Result.flatMap(relationSql(options.relations ?? {}, piece.relation), related => {
      if (related.table === outer) {
        return Result.fail(
          new SqlUnsupportedError({
            reason: `rows of a table related to itself (${piece.relation})`,
          }),
        )
      }
      const body = (part: Option.Option<Sql>) =>
        Option.match(part, {
          onNone: () => Result.succeed(Option.none<string>()),
          onSome: each => Result.map(render(each, related), Option.some),
        })
      // Value before filter: the subquery writes SELECT's value ahead of WHERE's filter,
      // and SQLite's `?` takes parameters in the order the text names them.
      return Result.flatMap(body(piece.value), value =>
        Result.flatMap(body(piece.where), where =>
          relatedSubquery(
            piece.fold,
            {
              from: quoteIdent(related.table),
              matches: `${quoteIdent(related.table)}.${quoteIdent(related.foreignKey)} = ${quoteIdent(outer)}.${quoteIdent(related.key ?? 'id')}`,
              where,
              value,
              aggregate:
                piece.fold === 'reduce' && piece.op !== undefined
                  ? val => {
                      const op = piece.op!
                      if (!isForeignLowerings(options.foreign)) {
                        return Result.fail(
                          new SqlUnsupportedError({
                            reason: `[metakit/sql] Arr.reduce over "${Node.foreignName(op)}" has no ${options.dialect} aggregate; declare lowering(${op.id}, { aggregate: { ${options.dialect} } }) or read the rows into memory.`,
                          }),
                        )
                      }
                      const foreign = options.foreign
                      const identity = op.claims?.identity?.value
                      return Result.flatMap(literal(identity), idPieces =>
                        Result.flatMap(
                          foreign.renderAggregate(options.dialect, op, val, parts =>
                            parts.join(''),
                          ),
                          agg =>
                            Result.map(
                              render(idPieces, related),
                              idSql => `COALESCE(${agg}, ${idSql})`,
                            ),
                        ),
                      )
                    }
                  : undefined,
            },
            text => text,
            chunks => chunks.join(''),
          ),
        ),
      )
    })
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
  const { render } = renderer({
    dialect,
    column: options?.column ?? defaultColumn,
    inline: true,
    foreign: {},
  })
  return Result.map(
    Result.flatMap(lowerCheck(schema, dialect), sql => render(sql)),
    text => `CHECK (${text})`,
  )
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
    foreign: options?.foreign ?? {},
    table: options?.table,
    relations: options?.relations,
  })
  const lowered = lowerWhere(expr, {
    dialect,
    rowPrefix: options?.rowPrefix ?? ['row'],
    env: options?.env,
  })
  return Result.map(
    Result.flatMap(lowered, sql => render(sql)),
    text => ({ text, params }),
  )
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
    readonly foreign?: ForeignSqlTable | ForeignLowerings
  },
): Result.Result<SqlFragment, SqlUnsupportedError | Refused> => {
  const dialect = options?.dialect ?? 'postgres'
  const { params, column, render } = renderer({
    dialect,
    column: options?.column ?? defaultColumn,
    inline: false,
    foreign: options?.foreign ?? {},
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
