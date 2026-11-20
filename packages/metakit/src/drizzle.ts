/**
 * Drizzle ORM SQL lowering (`metakit/drizzle`, optional peer `drizzle-orm`).
 *
 * Lowers `Expr`, `Schema` refinements, and `Transition`s directly into Drizzle
 * `SQL` AST objects using an exhaustive `Record<CoreOpId, DrizzleLowerer>`
 * table, with real Drizzle column references and parameterized values.
 */
import { sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { Option, Result } from 'effect'
import type { Schema } from 'effect'
import * as Expr from './expr.js'
import * as Node from './node.js'
import { residualizeNode } from './ops/residualize.js'
import * as Path from './path.js'
import { SqlUnsupportedError, type SqlDialect } from './sql.js'
import type { Transition } from './transition.js'

export type DrizzleTableColumns = object

export interface DrizzleOptions {
  readonly dialect?: SqlDialect
  readonly rowPrefix?: ReadonlyArray<string>
  readonly env?: Readonly<Record<string, unknown>>
}

interface DrizzleCtx {
  readonly dialect: SqlDialect
  readonly lower: (node: Node.Node) => Result.Result<SQL, SqlUnsupportedError>
}

export type DrizzleLowerer = (
  args: ReadonlyArray<Node.Node>,
  ctx: DrizzleCtx,
) => Result.Result<SQL, SqlUnsupportedError>

const binary =
  (op: string): DrizzleLowerer =>
  (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), l =>
      Result.map(ctx.lower(args[1]!), r => sql`(${l} ${sql.raw(op)} ${r})`),
    )

/** Exhaustive Drizzle lowering table over all 15 `CoreOpId` primitives. */
export const drizzleOps: Readonly<Record<Node.CoreOpId, DrizzleLowerer>> = {
  'bool.and': binary('AND'),
  'bool.or': binary('OR'),
  'bool.not': (args, ctx) => Result.map(ctx.lower(args[0]!), inner => sql`(NOT ${inner})`),
  'eq.is': (args, ctx) =>
    binary(ctx.dialect === 'postgres' ? 'IS NOT DISTINCT FROM' : 'IS')(args, ctx),
  'eq.isNot': (args, ctx) =>
    binary(ctx.dialect === 'postgres' ? 'IS DISTINCT FROM' : 'IS NOT')(args, ctx),
  'eq.in': (args, ctx) =>
    Result.flatMap(ctx.lower(args[0]!), needle => {
      const list = args[1]!
      if (!Node.$is('Lit')(list) || !Array.isArray(list.value)) {
        return Result.fail(
          new SqlUnsupportedError({
            reason: 'eq.in requires a literal array of candidates in Drizzle SQL',
          }),
        )
      }
      if (list.value.length === 0) return Result.succeed(sql`FALSE`)
      const nonNull = list.value.filter(v => v !== null)
      const hasNull = nonNull.length !== list.value.length
      if (nonNull.length === 0) return Result.succeed(sql`(${needle} IS NULL)`)
      const vals = sql.join(
        nonNull.map(v => sql`${v}`),
        sql`, `,
      )
      const inClause = sql`(${needle} IN (${vals}))`
      return Result.succeed(hasNull ? sql`(${inClause} OR (${needle} IS NULL))` : inClause)
    }),
  'null.isNull': (args, ctx) => Result.map(ctx.lower(args[0]!), inner => sql`(${inner} IS NULL)`),
  'ord.lt': binary('<'),
  'ord.lte': binary('<='),
  'ord.gt': binary('>'),
  'ord.gte': binary('>='),
  'num.add': binary('+'),
  'num.sub': binary('-'),
  'num.mul': binary('*'),
  'num.neg': (args, ctx) => Result.map(ctx.lower(args[0]!), inner => sql`(-${inner})`),
}

const lowerDrizzleNode = (
  node: Node.Node,
  table: DrizzleTableColumns,
  options: { readonly dialect: SqlDialect; readonly rowPrefix: ReadonlyArray<string> },
): Result.Result<SQL, SqlUnsupportedError> => {
  const ctx: DrizzleCtx = {
    dialect: options.dialect,
    lower: current =>
      Node.$match(current, {
        Lit: ({ value }) => Result.succeed(value === null ? sql`NULL` : sql`${value}`),
        Path: ({ segments }) => {
          if (!Path.isPrefix(options.rowPrefix, segments)) {
            return Result.fail(
              new SqlUnsupportedError({
                reason: `unbound path "${Path.format(segments)}" outside row prefix "${Path.format(options.rowPrefix)}"`,
              }),
            )
          }
          const rel = segments.slice(options.rowPrefix.length)
          if (rel.length === 0) {
            return Result.fail(
              new SqlUnsupportedError({
                reason: 'cannot lower root path to a single Drizzle column',
              }),
            )
          }
          const colKey = rel.join('_')
          if (!Object.hasOwn(table, colKey)) {
            return Result.fail(
              new SqlUnsupportedError({ reason: `table has no column "${colKey}"` }),
            )
          }
          const col = (table as Readonly<Record<string, unknown>>)[colKey] as AnyColumn
          return Result.succeed(sql`${col}`)
        },
        Call: ({ op, args }) => drizzleOps[op.id](args, ctx),
        If: ({ cond, then, otherwise }) =>
          Result.flatMap(ctx.lower(cond), c =>
            Result.flatMap(ctx.lower(then), t =>
              Result.map(ctx.lower(otherwise), e => sql`(CASE WHEN ${c} THEN ${t} ELSE ${e} END)`),
            ),
          ),
        Match: ({ on, cases, otherwise }) =>
          Result.flatMap(ctx.lower(on), target => {
            const parts: Array<SQL> = []
            for (const [val, branch] of cases) {
              const bRes = ctx.lower(branch)
              if (Result.isFailure(bRes)) return bRes
              parts.push(sql`WHEN ${val} THEN ${bRes.success}`)
            }
            const joined = sql.join(parts, sql` `)
            return Option.match(otherwise, {
              onNone: () => Result.succeed(sql`(CASE ${target} ${joined} END)`),
              onSome: fb =>
                Result.map(ctx.lower(fb), f => sql`(CASE ${target} ${joined} ELSE ${f} END)`),
            })
          }),
        Opaque: ({ name }) =>
          Result.fail(
            new SqlUnsupportedError({
              reason: `cannot lower opaque term "${name}" to Drizzle SQL`,
            }),
          ),
      }),
  }
  return ctx.lower(node)
}

/** Lower every invariant on `schema` into a Drizzle `SQL` expression for `check(name, sql)`. */
export const toCheck = <S extends Schema.Top>(
  schema: S,
  table: DrizzleTableColumns,
  options?: { readonly dialect?: SqlDialect },
): Result.Result<SQL, SqlUnsupportedError> => {
  const refinements = Expr.refinementsOf(schema)
  if (refinements.length === 0) return Result.succeed(sql`TRUE`)
  const parts: Array<SQL> = []
  for (const r of refinements) {
    const res = lowerDrizzleNode(r.node, table, {
      dialect: options?.dialect ?? 'postgres',
      rowPrefix: [],
    })
    if (Result.isFailure(res)) return res
    parts.push(res.success)
  }
  return Result.succeed(parts.length === 1 ? parts[0]! : sql`(${sql.join(parts, sql` AND `)})`)
}

/** Lower a boolean `Expr` into a Drizzle `SQL` predicate for `.where(...)`. */
export const toWhere = <Env>(
  expr: Expr.Expr<Env, boolean>,
  table: DrizzleTableColumns,
  options?: DrizzleOptions,
): Result.Result<SQL, SqlUnsupportedError> => {
  const simplified =
    options?.env !== undefined ? residualizeNode(expr.node, options.env) : expr.node
  return lowerDrizzleNode(simplified, table, {
    dialect: options?.dialect ?? 'postgres',
    rowPrefix: options?.rowPrefix ?? ['row'],
  })
}

/** Lower a `Transition` + concrete `input` into `{ set, where }` for `db.update(table).set(set).where(where)`. */
export const toUpdate = <State, Input, Emit>(
  transition: Transition<State, Input, Emit>,
  input: Input,
  table: DrizzleTableColumns,
  options?: { readonly dialect?: SqlDialect },
): Result.Result<
  { readonly set: Readonly<Record<string, SQL>>; readonly where: SQL },
  SqlUnsupportedError
> => {
  if (transition.writes.length === 0) {
    return Result.fail(
      new SqlUnsupportedError({
        reason: 'cannot lower a transition with no writes to Drizzle update',
      }),
    )
  }
  const dialect = options?.dialect ?? 'postgres'
  const partialEnv = { input }
  const set: Record<string, SQL> = {}
  for (const eq of transition.writes) {
    const colKey = eq.target.join('_')
    if (!Object.hasOwn(table, colKey)) {
      return Result.fail(
        new SqlUnsupportedError({ reason: `table has no write target column "${colKey}"` }),
      )
    }
    const rhs = residualizeNode(eq.value.node, partialEnv)
    const rhsRes = lowerDrizzleNode(rhs, table, { dialect, rowPrefix: ['state'] })
    if (Result.isFailure(rhsRes)) return Result.fail(rhsRes.failure)
    set[colKey] = rhsRes.success
  }
  const whenNode = residualizeNode(transition.when.node, partialEnv)
  const whereRes = lowerDrizzleNode(whenNode, table, { dialect, rowPrefix: ['state'] })
  if (Result.isFailure(whereRes)) return Result.fail(whereRes.failure)
  return Result.succeed({ set, where: whereRes.success })
}
