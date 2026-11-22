/**
 * SQL lowerings for custom operations (`metakit/operation/sql`).
 *
 * Kept on its own subpath so no browser page bundles SQL lowering code.
 * One lowering serves both `metakit/sql` (text + parameters) and `metakit/drizzle`
 * (Drizzle `SQL`), using the `piece` tagged template whose holes are strictly
 * other `SqlPiece` values so no raw value enters SQL as text.
 */
import { Result, type Schema } from 'effect'
import * as Node from './node.js'
import type { AnyOperation, Operation } from './operation.js'
import { SqlUnsupportedError } from './sqlLowering.js'
import type { ForeignSql } from './sqlRender.js'

const PIECE_TAG = Symbol.for('metakit/operation/sqlPiece')

/** A safe SQL fragment built by `piece` or supplied as a lowered argument. */
export interface SqlPiece {
  readonly [PIECE_TAG]: true
  readonly strings: ReadonlyArray<string>
  readonly holes: ReadonlyArray<SqlPiece | { readonly raw: unknown }>
}

/** Tagged template for SQL lowerings: holes may only be other `SqlPiece`s. */
export const piece = (
  strings: TemplateStringsArray,
  ...holes: ReadonlyArray<SqlPiece>
): SqlPiece => ({
  [PIECE_TAG]: true,
  strings,
  holes,
})

const rawPiece = <S>(raw: S): SqlPiece => ({
  [PIECE_TAG]: true,
  strings: ['', ''],
  holes: [{ raw }],
})

/** Render a `SqlPiece` tree into a target SQL representation `S`. */
export const renderPiece = <S>(
  fragment: SqlPiece,
  combine: (parts: ReadonlyArray<string | S>) => S,
): S => {
  const parts: Array<string | S> = []
  const walk = (node: SqlPiece): void => {
    for (let i = 0; i < node.strings.length; i++) {
      const text = node.strings[i]!
      if (text.length > 0) parts.push(text)
      if (i < node.holes.length) {
        const hole = node.holes[i]!
        if (PIECE_TAG in hole) walk(hole)
        else parts.push(hole.raw as S)
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
  /** Convert into a `ForeignSql<S>` table for `metakit/sql` or `metakit/drizzle`. */
  readonly toForeignSql: <S>(
    dialect: SqlDialect,
    combine: (parts: ReadonlyArray<string | S>) => S,
  ) => Readonly<Record<string, ForeignSql<S>>>
}

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

  return { entries, forDialect, aggregateForDialect, toForeignSql }
}
