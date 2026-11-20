/**
 * Server-tier SQL lowering (`metakit/sql`).
 *
 * Implements the exhaustive `sqlOps: Record<CoreOpId, SqlLowerer>` table over
 * all 15 v1 primitives. Derived helpers (`min`, `max`, `abs`, `clamp`,
 * `between`, `isNotNull`, `implies`) lower automatically via `CASE WHEN` +
 * the 15 primitives with zero extra rows here.
 */
import { Data, Option, Result } from 'effect'
import type { Schema } from 'effect'
import * as Expr from './expr.js'
import * as Node from './node.js'
import { residualizeNode } from './ops/residualize.js'
import * as Path from './path.js'
import type { Transition } from './transition.js'

export type SqlDialect = 'postgres' | 'sqlite'

export interface SqlFragment {
  readonly text: string
  readonly params: ReadonlyArray<unknown>
}

export class SqlUnsupportedError extends Data.TaggedError('SqlUnsupportedError')<{
  readonly reason: string
}> {}

export interface SqlOptions {
  readonly dialect?: SqlDialect
  readonly rowPrefix?: ReadonlyArray<string>
  readonly column?: (segments: ReadonlyArray<string>) => string
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

export interface SqlContext {
  readonly dialect: SqlDialect
  readonly inlineLiterals: boolean
  readonly rowPrefix: ReadonlyArray<string>
  readonly column: (segments: ReadonlyArray<string>) => string
  readonly params: Array<unknown>
  readonly bind: (value: unknown) => Result.Result<string, SqlUnsupportedError>
  readonly lower: (node: Node.Node) => Result.Result<string, SqlUnsupportedError>
}

export type SqlLowerer = (
  args: ReadonlyArray<Node.Node>,
  ctx: SqlContext,
) => Result.Result<string, SqlUnsupportedError>

const lowerBinary =
  (sqlOp: string): SqlLowerer =>
  (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), left =>
      Result.map(ctx.lower(args[1]!), right => `(${left} ${sqlOp} ${right})`),
    )

/** Exhaustive Tier 1 SQL lowering table over all 15 `CoreOpId` primitives. */
export const sqlOps: Readonly<Record<Node.CoreOpId, SqlLowerer>> = {
  'bool.and': lowerBinary('AND'),
  'bool.or': lowerBinary('OR'),
  'bool.not': (args, ctx) => Result.map(ctx.lower(args[0]!), inner => `(NOT ${inner})`),
  'eq.is': (args, ctx) => {
    const op = ctx.dialect === 'postgres' ? 'IS NOT DISTINCT FROM' : 'IS'
    return lowerBinary(op)(args, ctx)
  },
  'eq.isNot': (args, ctx) => {
    const op = ctx.dialect === 'postgres' ? 'IS DISTINCT FROM' : 'IS NOT'
    return lowerBinary(op)(args, ctx)
  },
  'eq.in': (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), needle => {
      const list = args[1]!
      if (!Node.$is('Lit')(list) || !Array.isArray(list.value)) {
        return Result.fail(
          new SqlUnsupportedError({
            reason: 'eq.in requires a literal array of candidates in SQL',
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
  'null.isNull': (args, ctx) => Result.map(ctx.lower(args[0]!), inner => `(${inner} IS NULL)`),
  'ord.lt': lowerBinary('<'),
  'ord.lte': lowerBinary('<='),
  'ord.gt': lowerBinary('>'),
  'ord.gte': lowerBinary('>='),
  'num.add': lowerBinary('+'),
  'num.sub': lowerBinary('-'),
  'num.mul': lowerBinary('*'),
  'num.neg': (args, ctx) => Result.map(ctx.lower(args[0]!), inner => `(-${inner})`),
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

  const ctx: SqlContext = {
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

/** Compile every invariant on `schema` into a SQL `CHECK (...)` clause. */
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

/** Compile a boolean `Expr` into a parameterized SQL `WHERE` predicate. */
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

/** Compile a `Transition` + concrete `input` into a guarded parameterized SQL `UPDATE`. */
export const toUpdate = <State, Input, Emit>(
  table: string,
  transition: Transition<State, Input, Emit>,
  input: Input,
  options?: {
    readonly dialect?: SqlDialect
    readonly column?: (segments: ReadonlyArray<string>) => string
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
