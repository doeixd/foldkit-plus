/**
 * SQL lowerings for custom operations (`@doeixd/metakit/operation/sql`).
 *
 * Kept on its own subpath so no browser page bundles SQL lowering code.
 * One lowering serves both `@doeixd/metakit/sql` (text + parameters) and `@doeixd/metakit/drizzle`
 * (Drizzle `SQL`), using the `piece` tagged template whose holes are strictly
 * other `SqlPiece` values so no raw value enters SQL as text.
 */
import { Result, type Schema } from 'effect'
import * as Node from './node.js'
import type { AnyOperation, Operation } from './operation.js'
import { SqlUnsupportedError } from './sqlLowering.js'
import type { ForeignSql } from './sqlRender.js'

const PIECE_TAG = Symbol('metakit/operation/sqlPiece')
const RAW_TAG = Symbol('metakit/operation/sqlRaw')
const LOWERINGS_TAG = Symbol('metakit/operation/foreignLowerings')

interface RawHole {
  readonly [RAW_TAG]: true
  readonly raw: unknown
}

/** A safe SQL fragment built by `piece` or supplied as a lowered argument. */
export interface SqlPiece {
  readonly [PIECE_TAG]: true
  readonly strings: ReadonlyArray<string>
  readonly holes: ReadonlyArray<SqlPiece | RawHole>
}

const isSqlPiece = (value: unknown): value is SqlPiece =>
  typeof value === 'object' && value !== null && PIECE_TAG in value

const isRawHole = (value: unknown): value is RawHole =>
  typeof value === 'object' && value !== null && RAW_TAG in value

/** Tagged template for SQL lowerings: holes may only be other `SqlPiece`s. */
export const piece = (
  strings: TemplateStringsArray,
  ...holes: ReadonlyArray<SqlPiece>
): SqlPiece => {
  for (const hole of holes) {
    if (!isSqlPiece(hole)) {
      throw new Error(
        '[metakit/sql] piece: every hole must be a SqlPiece built by piece(...) or passed as a lowering argument.',
      )
    }
  }
  return {
    [PIECE_TAG]: true,
    strings,
    holes,
  }
}

const rawPiece = <S>(raw: S): SqlPiece => ({
  [PIECE_TAG]: true,
  strings: ['', ''],
  holes: [{ [RAW_TAG]: true, raw }],
})

/** Render a `SqlPiece` tree into a target SQL representation `S`. */
export const renderPiece = <S>(
  fragment: SqlPiece,
  combine: (parts: ReadonlyArray<string | S>) => S,
): S => {
  if (!isSqlPiece(fragment)) {
    throw new Error(
      '[metakit/sql] renderPiece: expected a SqlPiece built by piece(...) or passed as a lowering argument.',
    )
  }
  const parts: Array<string | S> = []
  const walk = (node: SqlPiece): void => {
    for (let i = 0; i < node.strings.length; i++) {
      const text = node.strings[i]!
      if (text.length > 0) parts.push(text)
      if (i < node.holes.length) {
        const hole = node.holes[i]!
        if (isSqlPiece(hole)) walk(hole)
        else if (isRawHole(hole)) parts.push(hole.raw as S)
        else {
          throw new Error(
            '[metakit/sql] renderPiece: invalid hole in SqlPiece; holes must be created by piece(...).',
          )
        }
      }
    }
  }
  walk(fragment)
  return combine(parts)
}

/** Tuple of `SqlPiece` matching an operation's argument arity. */
export type PieceArgs<Args extends ReadonlyArray<Schema.Top>> = {
  readonly [K in keyof Args]: SqlPiece
}

export type SqlDialect = 'sqlite' | 'postgres'

/** SQL lowering functions for one custom operation across dialects. */
export interface SqlLowering<O extends AnyOperation = AnyOperation> {
  readonly op: O
  readonly key: string
  readonly sqlite?: (...args: ReadonlyArray<SqlPiece>) => SqlPiece
  readonly postgres?: (...args: ReadonlyArray<SqlPiece>) => SqlPiece
  readonly aggregate?: {
    readonly sqlite?: (arg: SqlPiece) => SqlPiece
    readonly postgres?: (arg: SqlPiece) => SqlPiece
  }
}

/** Declare SQL lowerings for `op`, typed by `op`'s argument arity. */
export const lowering = <
  Id extends string,
  V extends number,
  Args extends ReadonlyArray<Schema.Top>,
  R extends Schema.Top,
  N extends 'strict' | 'own',
  C extends object,
>(
  op: Operation<Id, V, Args, R, N, C>,
  spec: {
    readonly sqlite?: (...args: PieceArgs<Args>) => SqlPiece
    readonly postgres?: (...args: PieceArgs<Args>) => SqlPiece
    readonly aggregate?: {
      readonly sqlite?: (arg: SqlPiece) => SqlPiece
      readonly postgres?: (arg: SqlPiece) => SqlPiece
    }
  },
): SqlLowering<Operation<Id, V, Args, R, N, C>> => ({
  op,
  key: Node.foreignName(op.descriptor),
  ...(spec.sqlite !== undefined
    ? {
        sqlite: (...args: ReadonlyArray<SqlPiece>) =>
          spec.sqlite!(...(args as unknown as PieceArgs<Args>)),
      }
    : {}),
  ...(spec.postgres !== undefined
    ? {
        postgres: (...args: ReadonlyArray<SqlPiece>) =>
          spec.postgres!(...(args as unknown as PieceArgs<Args>)),
      }
    : {}),
  ...(spec.aggregate !== undefined ? { aggregate: spec.aggregate } : {}),
})

/** A table of SQL lowerings for custom operations. */
export interface ForeignLowerings {
  readonly entries: ReadonlyMap<string, SqlLowering>
  /** Look up the scalar lowering for `op` on `dialect`, or fail with an actionable message. */
  readonly forDialect: (
    dialect: SqlDialect,
    op: Node.ForeignOp,
  ) => Result.Result<(...args: ReadonlyArray<SqlPiece>) => SqlPiece, SqlUnsupportedError>
  /** Look up the aggregate lowering for `op` on `dialect`, or fail with an actionable message. */
  readonly aggregateForDialect: (
    dialect: SqlDialect,
    op: Node.ForeignOp,
  ) => Result.Result<(arg: SqlPiece) => SqlPiece, SqlUnsupportedError>
  /** Render a scalar call lowering into `S` for `dialect`, or fail with an actionable message. */
  readonly renderCall: <S>(
    dialect: SqlDialect,
    op: Node.ForeignOp,
    args: ReadonlyArray<S>,
    combine: (parts: ReadonlyArray<string | S>) => S,
  ) => Result.Result<S, SqlUnsupportedError>
  /** Render an aggregate lowering into `S` for `dialect`, or fail with an actionable message. */
  readonly renderAggregate: <S>(
    dialect: SqlDialect,
    op: Node.ForeignOp,
    arg: S,
    combine: (parts: ReadonlyArray<string | S>) => S,
  ) => Result.Result<S, SqlUnsupportedError>
  /** Convert into a `ForeignSql<S>` table for `@doeixd/metakit/sql` or `@doeixd/metakit/drizzle`. */
  readonly toForeignSql: <S>(
    dialect: SqlDialect,
    combine: (parts: ReadonlyArray<string | S>) => S,
  ) => Readonly<Record<string, ForeignSql<S>>>
}

/** Whether `value` is a `ForeignLowerings` table built by `lowerings(...)`. */
export const isForeignLowerings = (value: unknown): value is ForeignLowerings =>
  typeof value === 'object' && value !== null && LOWERINGS_TAG in value

/** Collect SQL lowerings, refusing duplicates for one `id@version`. */
export const lowerings = (...list: ReadonlyArray<SqlLowering>): ForeignLowerings => {
  const entries = new Map<string, SqlLowering>()
  for (const item of list) {
    if (entries.has(item.key)) {
      throw new Error(
        `[metakit/sql] lowerings: "${item.key}" is lowered twice; pass one lowering per operation and version.`,
      )
    }
    entries.set(item.key, item)
  }

  const forDialect = (
    dialect: SqlDialect,
    op: Node.ForeignOp,
  ): Result.Result<(...args: ReadonlyArray<SqlPiece>) => SqlPiece, SqlUnsupportedError> => {
    const name = Node.foreignName(op)
    const entry = entries.get(name)?.[dialect]
    if (entry === undefined) {
      return Result.fail(
        new SqlUnsupportedError({
          reason: `[metakit/sql] no ${dialect} lowering of "${name}"; declare one with lowering(${op.id}, { ${dialect} }) from metakit/operation/sql.`,
        }),
      )
    }
    return Result.succeed(entry)
  }

  const aggregateForDialect = (
    dialect: SqlDialect,
    op: Node.ForeignOp,
  ): Result.Result<(arg: SqlPiece) => SqlPiece, SqlUnsupportedError> => {
    const name = Node.foreignName(op)
    const entry = entries.get(name)?.aggregate?.[dialect]
    if (entry === undefined) {
      return Result.fail(
        new SqlUnsupportedError({
          reason: `[metakit/sql] Arr.reduce over "${name}" has no ${dialect} aggregate; declare lowering(${op.id}, { aggregate: { ${dialect} } }) or read the rows into memory.`,
        }),
      )
    }
    return Result.succeed(entry)
  }

  const renderCall = <S>(
    dialect: SqlDialect,
    op: Node.ForeignOp,
    args: ReadonlyArray<S>,
    combine: (parts: ReadonlyArray<string | S>) => S,
  ): Result.Result<S, SqlUnsupportedError> =>
    Result.map(forDialect(dialect, op), fn => renderPiece(fn(...args.map(rawPiece)), combine))

  const renderAggregate = <S>(
    dialect: SqlDialect,
    op: Node.ForeignOp,
    arg: S,
    combine: (parts: ReadonlyArray<string | S>) => S,
  ): Result.Result<S, SqlUnsupportedError> =>
    Result.map(aggregateForDialect(dialect, op), fn => renderPiece(fn(rawPiece(arg)), combine))

  const toForeignSql = <S>(
    dialect: SqlDialect,
    combine: (parts: ReadonlyArray<string | S>) => S,
  ): Readonly<Record<string, ForeignSql<S>>> => {
    const table: Record<string, ForeignSql<S>> = {}
    for (const [key, item] of entries) {
      const fn = item[dialect]
      if (fn === undefined) continue
      table[key] = {
        sql: args => renderPiece(fn(...args.map(rawPiece)), combine),
      }
    }
    return table
  }

  const result: ForeignLowerings = {
    entries,
    forDialect,
    aggregateForDialect,
    renderCall,
    renderAggregate,
    toForeignSql,
  }
  Object.defineProperty(result, LOWERINGS_TAG, { value: true })
  return result
}
