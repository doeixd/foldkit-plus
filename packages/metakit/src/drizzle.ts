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

/**
 * Where the rows related to a row through a relation are: their table, the
 * key of its column that holds the id of the row they point at, and the key
 * of the row's own table's column that id is (default `id`).
 */
export interface DrizzleRelation {
  readonly table: Table
  readonly foreignKey: string | ReadonlyArray<string>
  readonly key?: string | ReadonlyArray<string>
}

/** The table of each relation a `Rows` node over related rows names, by relation. */
export type DrizzleRelations = Readonly<Record<string, DrizzleRelation>>

/**
 * The Drizzle `SQL` of each foreign operation, by `id@version`
 * (`Node.foreignName`), from its arguments rendered as Drizzle `SQL`. A
 * foreign call with no entry is refused by that name.
 */
export type ForeignDrizzle = Readonly<Record<string, ForeignSql<SQL>>>

export interface DrizzleOptions {
  readonly dialect?: SqlDialect
  /** As `SqlOptions.rowPrefix`: default `['row']`, and `[]` reads every path as a column. */
  readonly rowPrefix?: ReadonlyArray<string>
  readonly env?: Readonly<Record<string, unknown>>
  readonly foreign?: ForeignDrizzle | ForeignLowerings
  readonly relations?: DrizzleRelations
}

const columnOf = (
  columns: Readonly<Record<string, SQLChunk>>,
  name: string,
): Result.Result<SQLChunk, SqlUnsupportedError> =>
  Object.hasOwn(columns, name)
    ? Result.succeed(columns[name]!)
    : Result.fail(new SqlUnsupportedError({ reason: `table has no column "${name}"` }))

/** Renders pieces as Drizzle `SQL`, reading a path as the table's column of that key (segments joined by `_`). */
const renderer = (
  table: Table,
  options: {
    readonly dialect: SqlDialect
    readonly inline: boolean
    readonly foreign: ForeignDrizzle | ForeignLowerings
    readonly relations?: DrizzleRelations | undefined
  },
) => {
  const columns: Readonly<Record<string, SQLChunk>> = getTableColumns(table)
  let aliasCount = 0
  const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`
  const aliasedCol = (col: SQLChunk, alias: string): SQLChunk => {
    const colName = (col as { readonly name?: string }).name
    return colName !== undefined ? sql.raw(`${quoteIdent(alias)}.${quoteIdent(colName)}`) : col
  }
  const key = columnNames(segments => segments.join('_'))
  const column = (segments: ReadonlyArray<string>): Result.Result<string, SqlUnsupportedError> =>
    Result.flatMap(key(segments), name => Result.map(columnOf(columns, name), () => name))
  const render = (
    pieces: Sql,
    related?: { readonly rel: DrizzleRelation; readonly alias?: string },
  ): Result.Result<SQL, SqlUnsupportedError> => {
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
        Foreign: ({ op, args }) => {
          const table = options.foreign
          if (isForeignLowerings(table)) {
            return Result.flatMap(Result.all(args.map(arg => render(arg, related))), rendered =>
              table.renderCall(options.dialect, op, rendered, parts =>
                sql.join(parts.map(part => (typeof part === 'string' ? sql.raw(part) : part))),
              ),
            )
          }
          return Result.flatMap(foreignSql(table, op), entry =>
            Result.map(Result.all(args.map(arg => render(arg, related))), rendered =>
              entry.sql(rendered, options.dialect),
            ),
          )
        },
        Each: ({ segments }) =>
          related === undefined
            ? Result.fail(
                new SqlUnsupportedError({ reason: 'a related row is read outside its rows' }),
              )
            : Result.map(columnOf(getTableColumns(related.rel.table), segments.join('_')), col =>
                related.alias === undefined ? col : aliasedCol(col, related.alias),
              ),
        Rows: piece => renderRows(piece),
      })
      if (Result.isFailure(chunk)) return Result.fail(chunk.failure)
      chunks.push(chunk.success)
    }
    return Result.succeed(sql.join(chunks))
  }
  const renderRows = (
    piece: Extract<SqlPiece, { readonly _tag: 'Rows' }>,
  ): Result.Result<SQLChunk, SqlUnsupportedError> => {
    if (piece.of.length > 0) {
      return Result.fail(
        new SqlUnsupportedError({
          reason: `rows related to a row reached through "${piece.of.join('.')}"`,
        }),
      )
    }
    return Result.flatMap(relationSql(options.relations ?? {}, piece.relation), related => {
      const selfRef = related.table === table
      const alias = selfRef ? `__rel_${aliasCount++}` : undefined
      const relCols: Readonly<Record<string, SQLChunk>> = getTableColumns(related.table)
      const fkNames = Array.isArray(related.foreignKey) ? related.foreignKey : [related.foreignKey]
      const pkNames =
        related.key === undefined
          ? ['id']
          : Array.isArray(related.key)
            ? related.key
            : [related.key]
      if (fkNames.length !== pkNames.length) {
        return Result.fail(
          new SqlUnsupportedError({
            reason: `relation ${piece.relation} foreignKey (${fkNames.length}) and key (${pkNames.length}) column counts differ`,
          }),
        )
      }
      const relCtx = alias === undefined ? { rel: related } : { rel: related, alias }
      const body = (part: Option.Option<Sql>) =>
        Option.match(part, {
          onNone: () => Result.succeed(Option.none<SQL>()),
          onSome: each => Result.map(render(each, relCtx), Option.some),
        })
      return Result.flatMap(Result.all(fkNames.map(fk => columnOf(relCols, fk))), foreignCols =>
        Result.flatMap(Result.all(pkNames.map(pk => columnOf(columns, pk))), ownCols =>
          Result.flatMap(body(piece.where), where =>
            Result.flatMap(body(piece.value), value =>
              relatedSubquery<SQL>(
                piece.fold,
                {
                  from:
                    alias === undefined
                      ? sql`${related.table}`
                      : sql`${related.table} AS ${sql.raw(quoteIdent(alias))}`,
                  matches: sql.join(
                    foreignCols.map((fc, i) => {
                      const left = alias === undefined ? fc : aliasedCol(fc, alias)
                      return sql`${left} = ${ownCols[i]!}`
                    }),
                    sql.raw(' AND '),
                  ),
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
                                sql.join(
                                  parts.map(part =>
                                    typeof part === 'string' ? sql.raw(part) : part,
                                  ),
                                ),
                              ),
                              agg =>
                                Result.map(
                                  render(idPieces, relCtx),
                                  idSql => sql`COALESCE(${agg}, ${idSql})`,
                                ),
                            ),
                          )
                        }
                      : undefined,
                },
                text => sql.raw(text),
                parts => sql.join([...parts]),
              ),
            ),
          ),
        ),
      )
    })
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
  const { render } = renderer(table, { dialect, inline: true, foreign: {} })
  return Result.flatMap(lowerCheck(schema, dialect), pieces => render(pieces))
}

/** A boolean `Expr` as a Drizzle `SQL` predicate for `.where(...)`, which keeps a row only where it is true. */
export const toWhere = <Env>(
  expr: Expr.Expr<Env, boolean | null>,
  table: Table,
  options?: DrizzleOptions,
): Result.Result<SQL, SqlUnsupportedError> => {
  const dialect = options?.dialect ?? 'postgres'
  const { render } = renderer(table, {
    dialect,
    inline: false,
    foreign: options?.foreign ?? {},
    relations: options?.relations,
  })
  return Result.flatMap(
    lowerWhere(expr, { dialect, rowPrefix: options?.rowPrefix ?? ['row'], env: options?.env }),
    pieces => render(pieces),
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
  options?: { readonly dialect?: SqlDialect; readonly foreign?: ForeignDrizzle | ForeignLowerings },
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
