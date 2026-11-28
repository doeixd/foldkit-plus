/**
 * What `@doeixd/metakit/sql` and `@doeixd/metakit/drizzle` share to render lowered pieces:
 * the entry of a foreign operation, a literal written into DDL, the value a
 * driver binds, one column per path, and the shape of a subquery over the
 * rows related to the row a predicate is asked of.
 */
import { Option, Result } from 'effect'
import * as Node from './node.js'
import * as Path from './path.js'
import { SqlUnsupportedError, type RelatedFold, type SqlDialect } from './sqlLowering.js'

const unsupported = (reason: string): Result.Result<never, SqlUnsupportedError> =>
  Result.fail(new SqlUnsupportedError({ reason }))

/** The SQL of a foreign operation for a dialect, from its lowered arguments, in some form of SQL. */
export interface ForeignSql<S> {
  readonly sql: (args: ReadonlyArray<S>, dialect: SqlDialect) => S
}

/** The entry of `table` for a foreign call, by `id@version`, refused by that name where it has none. */
export const foreignSql = <S>(
  table: Readonly<Record<string, ForeignSql<S>>>,
  op: Node.ForeignOp,
): Result.Result<ForeignSql<S>, SqlUnsupportedError> => {
  const name = Node.foreignName(op)
  const entry = Object.hasOwn(table, name) ? table[name] : undefined
  return entry !== undefined
    ? Result.succeed(entry)
    : unsupported(`no SQL is given for the foreign operation ${name}`)
}

/** The entry of `table` for a relation, refused by name where it has none. */
export const relationSql = <R>(
  table: Readonly<Record<string, R>>,
  relation: string,
): Result.Result<R, SqlUnsupportedError> => {
  const entry = Object.hasOwn(table, relation) ? table[relation] : undefined
  return entry === undefined
    ? unsupported(`no table is given for the rows related through ${relation}`)
    : Result.succeed(entry)
}

/** A literal written into SQL text, for DDL, which takes no parameters. */
export const inlineLiteral = (value: unknown): Result.Result<string, SqlUnsupportedError> => {
  if (typeof value === 'boolean') return Result.succeed(value ? 'TRUE' : 'FALSE')
  if (typeof value === 'number') return Result.succeed(String(value))
  if (typeof value === 'string') return Result.succeed(`'${value.replaceAll("'", "''")}'`)
  return unsupported(`cannot inline a literal of type ${typeof value}`)
}

/** The value a driver binds: SQLite has no boolean, and its drivers refuse one. */
export const bound = (value: unknown, dialect: SqlDialect): unknown =>
  dialect === 'sqlite' && typeof value === 'boolean' ? (value ? 1 : 0) : value

/**
 * Names each path's column once. Two paths that come to one name (`a_b` and
 * `a.b` under the default naming) would read one column for two fields.
 */
export const columnNames = (
  name: (segments: ReadonlyArray<string>) => string,
): ((segments: ReadonlyArray<string>) => Result.Result<string, SqlUnsupportedError>) => {
  const paths = new Map<string, string>()
  return segments => {
    const column = name(segments)
    const path = Path.format(segments)
    const prior = paths.get(column)
    if (prior !== undefined && prior !== path) {
      return unsupported(`paths "${prior}" and "${path}" both name the column ${column}`)
    }
    paths.set(column, path)
    return Result.succeed(column)
  }
}

/**
 * A correlated subquery over the related rows, in a renderer's form of SQL:
 * `from` is their table, `matches` says a row points at the row asked of,
 * and an element passes only where `where` is true. Over none that passes,
 * `count` and `sum` are 0, `min` and `max` null, `any` false and `every` true.
 */
export const relatedSubquery = <S>(
  fold: RelatedFold,
  parts: {
    readonly from: S
    readonly matches: S
    readonly where: Option.Option<S>
    readonly value: Option.Option<S>
    readonly aggregate?: ((value: S) => Result.Result<S, SqlUnsupportedError>) | undefined
  },
  text: (sql: string) => S,
  join: (chunks: ReadonlyArray<S>) => S,
): Result.Result<S, SqlUnsupportedError> => {
  const { from, matches, where } = parts
  const passes = Option.match(where, {
    onNone: () => [],
    onSome: test => [text(' AND ('), test, text(') IS TRUE')],
  })
  const select = (what: string, value: ReadonlyArray<S>, close: string): S =>
    join([
      text(`(SELECT ${what}`),
      ...value,
      text(`${close} FROM `),
      from,
      text(' WHERE '),
      matches,
      ...passes,
      text(')'),
    ])
  const ofValue = (shape: (value: S) => S): Result.Result<S, SqlUnsupportedError> =>
    Option.match(parts.value, {
      onNone: () => unsupported(`rows.${fold} over related rows has no value to fold`),
      onSome: value => Result.succeed(shape(value)),
    })
  switch (fold) {
    case 'any':
      return Result.succeed(join([text('EXISTS '), select('1', [], '')]))
    case 'every':
      // No row whose test is not true: one that is null fails, as it does not pass.
      return Result.succeed(
        Option.match(where, {
          onNone: () => text('TRUE'),
          onSome: test =>
            join([
              text('NOT EXISTS (SELECT 1 FROM '),
              from,
              text(' WHERE '),
              matches,
              text(' AND NOT (('),
              test,
              text(') IS TRUE))'),
            ]),
        }),
      )
    case 'count':
      return Result.succeed(select('COUNT(*)', [], ''))
    case 'sum':
      return ofValue(value => select('COALESCE(SUM(', [value], '), 0)'))
    case 'min':
      return ofValue(value => select('MIN(', [value], ')'))
    case 'max':
      return ofValue(value => select('MAX(', [value], ')'))
    case 'reduce':
      return Option.match(parts.value, {
        onNone: () => unsupported('rows.reduce over related rows has no value to fold'),
        onSome: value =>
          parts.aggregate === undefined
            ? unsupported('rows.reduce over related rows has no aggregate lowering')
            : Result.map(parts.aggregate(value), agg => select('', [agg], '')),
      })
  }
}
