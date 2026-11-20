/**
 * Server-tier SQL lowering (`metakit/sql`).
 *
 * Lowers `Schema` refinements (`Sql.toCheck`), `Expr` predicates
 * (`Sql.toWhere`), and guarded `Transition`s (`Sql.toUpdate`) through an
 * exhaustive `Record<Node.OpId, ...>` table. Adding an `OpId` fails to compile
 * here until SQL lowering implements it or refuses it by name.
 *
 * Equality lowers to `IS NOT DISTINCT FROM` (Postgres) / `IS` (SQLite) so
 * nullable columns match `Expr.eval` and `Expr.residualize` without SQL's
 * `NULL = NULL -> UNKNOWN` divergence.
 */
import { Data, Option, Result } from 'effect'
import type { Schema } from 'effect'
import * as Expr from './expr.js'
import * as Node from './node.js'
import { residualizeNode } from './ops/residualize.js'
import * as Path from './path.js'
import type { Transition } from './transition.js'

export type SqlDialect = 'postgres' | 'sqlite'

/** A parameterized SQL fragment. */
export interface SqlFragment {
  readonly text: string
  readonly params: ReadonlyArray<unknown>
}

export class SqlUnsupportedError extends Data.TaggedError('SqlUnsupportedError')<{
  readonly reason: string
}> {}

export interface SqlOptions {
  readonly dialect?: SqlDialect
  /**
   * Prefix segments that refer to table columns (e.g. `['row']` for
   * `Expr<{ row, principal }, boolean>`, or `[]` for `Expr<Account, boolean>`).
   */
  readonly rowPrefix?: ReadonlyArray<string>
  /** Custom column identifier mapping (defaults to quoting the last segment). */
  readonly column?: (segments: ReadonlyArray<string>) => string
  /** Optional known non-row environment slices (e.g. `{ principal, params }`) to bind as SQL parameters. */
  readonly env?: Readonly<Record<string, unknown>>
}

const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`

const inlineLiteral = (value: unknown): Result.Result<string, SqlUnsupportedError> => {
  if (value === null) return Result.succeed('NULL')
  if (typeof value === 'boolean') return Result.succeed(value ? 'TRUE' : 'FALSE')
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return Result.fail(new SqlUnsupportedError({ reason: `non-finite number literal: ${value}` }))
    }
    return Result.succeed(String(value))
  }
  if (typeof value === 'string') {
    return Result.succeed(`'${value.replaceAll("'", "''")}'`)
  }
  return Result.fail(
    new SqlUnsupportedError({ reason: `cannot inline literal of type ${typeof value}` }),
  )
}

interface LowerCtx {
  readonly dialect: SqlDialect
  readonly inlineLiterals: boolean
  readonly rowPrefix: ReadonlyArray<string>
  readonly column: (segments: ReadonlyArray<string>) => string
  readonly params: Array<unknown>
  readonly bind: (value: unknown) => Result.Result<string, SqlUnsupportedError>
  readonly lower: (node: Node.Node) => Result.Result<string, SqlUnsupportedError>
}

type OpLower = (
  args: ReadonlyArray<Node.Node>,
  ctx: LowerCtx,
) => Result.Result<string, SqlUnsupportedError>

const lowerBinary =
  (sqlOp: string): OpLower =>
  (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), left =>
      Result.map(ctx.lower(args[1]!), right => `(${left} ${sqlOp} ${right})`),
    )

const sqlOps: Readonly<Record<Node.OpId, OpLower>> = {
  and: lowerBinary('AND'),
  or: lowerBinary('OR'),
  not: (args, ctx) => Result.map(ctx.lower(args[0]!), inner => `(NOT ${inner})`),
  is: (args, ctx) => {
    const op = ctx.dialect === 'postgres' ? 'IS NOT DISTINCT FROM' : 'IS'
    return lowerBinary(op)(args, ctx)
  },
  isNot: (args, ctx) => {
    const op = ctx.dialect === 'postgres' ? 'IS DISTINCT FROM' : 'IS NOT'
    return lowerBinary(op)(args, ctx)
  },
  isNull: (args, ctx) => Result.map(ctx.lower(args[0]!), inner => `(${inner} IS NULL)`),
  oneOf: (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), needle => {
      const list = args[1]!
      if (!Node.$is('Lit')(list) || !Array.isArray(list.value)) {
        return Result.fail(
          new SqlUnsupportedError({
            reason: 'oneOf requires a literal array of candidates in SQL',
          }),
        )
      }
      if (list.value.length === 0) return Result.succeed('FALSE')
      let hasNull = false
      const items: Array<string> = []
      for (const item of list.value) {
        if (item === null) {
          hasNull = true
          continue
        }
        const bound = ctx.bind(item)
        if (Result.isFailure(bound)) return bound
        items.push(bound.success)
      }
      if (items.length === 0) return Result.succeed(`(${needle} IS NULL)`)
      const inClause = `(${needle} IN (${items.join(', ')}))`
      return Result.succeed(hasNull ? `(${inClause} OR (${needle} IS NULL))` : inClause)
    }),
  lt: lowerBinary('<'),
  lte: lowerBinary('<='),
  gt: lowerBinary('>'),
  gte: lowerBinary('>='),
  add: lowerBinary('+'),
  sub: lowerBinary('-'),
  mul: lowerBinary('*'),
  neg: (args, ctx) => Result.map(ctx.lower(args[0]!), inner => `(-${inner})`),
  min: (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), left =>
      Result.map(ctx.lower(args[1]!), right =>
        ctx.dialect === 'postgres' ? `LEAST(${left}, ${right})` : `MIN(${left}, ${right})`,
      ),
    ),
  max: (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), left =>
      Result.map(ctx.lower(args[1]!), right =>
        ctx.dialect === 'postgres' ? `GREATEST(${left}, ${right})` : `MAX(${left}, ${right})`,
      ),
    ),
  abs: (args, ctx) => Result.map(ctx.lower(args[0]!), inner => `ABS(${inner})`),
  len: (args, ctx) =>
    Result.map(ctx.lower(args[0]!), inner =>
      ctx.dialect === 'postgres' ? `CHAR_LENGTH(${inner})` : `LENGTH(${inner})`,
    ),
  startsWith: (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), str =>
      Result.map(ctx.lower(args[1]!), prefix =>
        ctx.dialect === 'postgres'
          ? `(LEFT(${str}, CHAR_LENGTH(${prefix})) = ${prefix})`
          : `(SUBSTR(${str}, 1, LENGTH(${prefix})) = ${prefix})`,
      ),
    ),
  contains: (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), str =>
      Result.map(ctx.lower(args[1]!), needle =>
        ctx.dialect === 'postgres'
          ? `(STRPOS(${str}, ${needle}) > 0)`
          : `(INSTR(${str}, ${needle}) > 0)`,
      ),
    ),
  struct: () =>
    Result.fail(
      new SqlUnsupportedError({ reason: 'struct construction is not a scalar SQL expression' }),
    ),
}

const lowerNodeWith = (
  node: Node.Node,
  options: {
    readonly dialect: SqlDialect
    readonly inlineLiterals: boolean
    readonly rowPrefix: ReadonlyArray<string>
    readonly column: (segments: ReadonlyArray<string>) => string
    readonly params: Array<unknown>
  },
): Result.Result<string, SqlUnsupportedError> => {
  const bind = (value: unknown): Result.Result<string, SqlUnsupportedError> => {
    if (options.inlineLiterals) return inlineLiteral(value)
    if (value === null) return Result.succeed('NULL')
    options.params.push(value)
    return Result.succeed(options.dialect === 'postgres' ? `$${options.params.length}` : '?')
  }

  const ctx: LowerCtx = {
    dialect: options.dialect,
    inlineLiterals: options.inlineLiterals,
    rowPrefix: options.rowPrefix,
    column: options.column,
    params: options.params,
    bind,
    lower: current =>
      Node.$match(current, {
        Lit: ({ value }) => bind(value),
        Path: ({ segments }) => {
          if (Path.isPrefix(options.rowPrefix, segments)) {
            const rel = segments.slice(options.rowPrefix.length)
            if (rel.length === 0) {
              return Result.fail(
                new SqlUnsupportedError({
                  reason: 'cannot lower root path to a single SQL column',
                }),
              )
            }
            return Result.succeed(options.column(rel))
          }
          return Result.fail(
            new SqlUnsupportedError({
              reason: `unbound path "${Path.format(segments)}" outside row prefix "${Path.format(options.rowPrefix)}"`,
            }),
          )
        },
        Call: ({ op, args }) => sqlOps[op.id](args, ctx),
        If: ({ cond, then, otherwise }) =>
          Result.flatMap(ctx.lower(cond), c =>
            Result.flatMap(ctx.lower(then), t =>
              Result.map(ctx.lower(otherwise), e => `(CASE WHEN ${c} THEN ${t} ELSE ${e} END)`),
            ),
          ),
        Match: ({ on, cases, otherwise }) =>
          Result.flatMap(ctx.lower(on), target => {
            const parts: Array<string> = []
            for (const [val, branch] of cases) {
              const litRes = bind(val)
              if (Result.isFailure(litRes)) return litRes
              const bRes = ctx.lower(branch)
              if (Result.isFailure(bRes)) return bRes
              parts.push(`WHEN ${litRes.success} THEN ${bRes.success}`)
            }
            const elseRes = Option.match(otherwise, {
              onNone: () => Result.succeed(''),
              onSome: fallback => Result.map(ctx.lower(fallback), f => ` ELSE ${f}`),
            })
            return Result.map(elseRes, e => `(CASE ${target} ${parts.join(' ')}${e} END)`)
          }),
        Opaque: ({ name }) =>
          Result.fail(
            new SqlUnsupportedError({ reason: `cannot lower opaque term "${name}" to SQL` }),
          ),
      }),
  }

  return ctx.lower(node)
}

const defaultColumn = (segments: ReadonlyArray<string>): string => quoteIdent(segments.join('_'))

/**
 * Compile every `Expr.refine` invariant on `schema` into a SQL `CHECK (...)`
 * constraint clause (with inline literals).
 */
export const toCheck = <S extends Schema.Top>(
  schema: S,
  options?: {
    readonly dialect?: SqlDialect
    readonly column?: (segments: ReadonlyArray<string>) => string
  },
): Result.Result<string, SqlUnsupportedError> => {
  const refinements = Expr.refinementsOf(schema)
  if (refinements.length === 0) return Result.succeed('CHECK (TRUE)')
  const parts: Array<string> = []
  for (const r of refinements) {
    const res = lowerNodeWith(r.node, {
      dialect: options?.dialect ?? 'postgres',
      inlineLiterals: true,
      rowPrefix: [],
      column: options?.column ?? defaultColumn,
      params: [],
    })
    if (Result.isFailure(res)) return res
    parts.push(res.success)
  }
  const combined = parts.length === 1 ? parts[0]! : parts.join(' AND ')
  return Result.succeed(`CHECK (${combined})`)
}

/**
 * Compile a boolean `Expr` into a parameterized SQL `WHERE` predicate.
 *
 * When `options.env` provides non-row slices (such as `{ principal }`), they
 * are partially evaluated first so known values become SQL parameters.
 */
export const toWhere = <Env>(
  expr: Expr.Expr<Env, boolean>,
  options?: SqlOptions,
): Result.Result<SqlFragment, SqlUnsupportedError> => {
  const simplified =
    options?.env !== undefined ? residualizeNode(expr.node, options.env) : expr.node
  const params: Array<unknown> = []
  const textRes = lowerNodeWith(simplified, {
    dialect: options?.dialect ?? 'postgres',
    inlineLiterals: false,
    rowPrefix: options?.rowPrefix ?? ['row'],
    column: options?.column ?? defaultColumn,
    params,
  })
  return Result.map(textRes, text => ({ text, params }))
}

/**
 * Compile a `Transition` + concrete `input` into a guarded parameterized SQL
 * `UPDATE <table> SET ... WHERE ...` statement.
 */
export const toUpdate = <State, Input, Emit>(
  table: string,
  transition: Transition<State, Input, Emit>,
  input: Input,
  options?: {
    readonly dialect?: SqlDialect
    readonly column?: (segments: ReadonlyArray<string>) => string
    /** Extra WHERE predicate (e.g. primary key match `{ column: 'id', value: 'acct_1' }`). */
    readonly whereId?: { readonly column: string; readonly value: unknown }
  },
): Result.Result<SqlFragment, SqlUnsupportedError> => {
  const dialect = options?.dialect ?? 'postgres'
  const column = options?.column ?? defaultColumn
  const params: Array<unknown> = []
  const partialEnv = { input }

  const setClauses: Array<string> = []
  if (transition.writes.length === 0) {
    return Result.fail(
      new SqlUnsupportedError({ reason: 'cannot lower a transition with no writes to SQL UPDATE' }),
    )
  }
  for (const eq of transition.writes) {
    const rhs = residualizeNode(eq.value.node, partialEnv)
    const rhsRes = lowerNodeWith(rhs, {
      dialect,
      inlineLiterals: false,
      rowPrefix: ['state'],
      column,
      params,
    })
    if (Result.isFailure(rhsRes)) return Result.fail(rhsRes.failure)
    setClauses.push(`${column(eq.target)} = ${rhsRes.success}`)
  }

  const whenNode = residualizeNode(transition.when.node, partialEnv)
  const whenRes = lowerNodeWith(whenNode, {
    dialect,
    inlineLiterals: false,
    rowPrefix: ['state'],
    column,
    params,
  })
  if (Result.isFailure(whenRes)) return Result.fail(whenRes.failure)

  let whereSql = whenRes.success
  if (options?.whereId !== undefined) {
    params.push(options.whereId.value)
    const placeholder = dialect === 'postgres' ? `$${params.length}` : '?'
    whereSql = `${quoteIdent(options.whereId.column)} = ${placeholder} AND ${whereSql}`
  }

  return Result.succeed({
    text: `UPDATE ${quoteIdent(table)} SET ${setClauses.join(', ')} WHERE ${whereSql}`,
    params,
  })
}
