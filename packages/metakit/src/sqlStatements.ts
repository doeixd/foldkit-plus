/**
 * What `metakit/sql` and `metakit/drizzle` lower whole: a Schema's rules as
 * one condition, a predicate as a `WHERE`, and a transition for one input as
 * the columns it sets and its guard.
 */
import { Option, Result, Schema } from 'effect'
import { collectFields, pathKey, type FieldInfo } from './abstract/fields.js'
import * as Expr from './expr.js'
import * as Node from './node.js'
import * as Bool from './ops/bool.js'
import * as Null from './ops/null.js'
import { residualizeNode } from './ops/residualize.js'
import {
  lowerNode,
  SqlPiece,
  SqlUnsupportedError,
  type Sql,
  type SqlDialect,
} from './sqlLowering.js'
import { Refused, type Transition } from './transition.js'

type Lowered = Result.Result<Sql, SqlUnsupportedError>

const text = (sql: string): SqlPiece => SqlPiece.Text({ text: sql })

/**
 * Every rule of `schema` as one condition that holds only when each rule is
 * true: a rule that is unknown of a null fails the check, as the Schema
 * refuses the value.
 */
export const lowerCheck = (schema: Schema.Top, dialect: SqlDialect): Lowered => {
  const fields = new Map<string, FieldInfo>()
  collectFields(schema.ast, [], fields)
  const rules: Array<Sql> = []
  for (const rule of Expr.rulesOf(schema)) {
    const info = rule.at.length > 0 ? fields.get(pathKey(rule.at)) : undefined
    const guarded =
      info !== undefined && info.optional
        ? Node.Call({
            op: Bool.orOp,
            args: [
              Node.Call({
                op: Null.isNullOp,
                args: [Node.Path({ segments: rule.at, ast: Option.none() })],
              }),
              rule.expr.node,
            ],
          })
        : rule.expr.node
    const lowered = lowerNode(guarded, { dialect, rowPrefix: [] })
    if (Result.isFailure(lowered)) return lowered
    rules.push(lowered.success)
  }
  if (rules.length === 0) return Result.succeed([text('TRUE')])
  const all = rules.flatMap((rule, index) => (index === 0 ? rule : [text(' AND '), ...rule]))
  return Result.succeed([text('('), ...all, text(') IS TRUE')])
}

export const lowerWhere = <Env>(
  expr: Expr.Expr<Env, unknown>,
  options: {
    readonly dialect: SqlDialect
    readonly rowPrefix: ReadonlyArray<string>
    readonly env?: Readonly<Record<string, unknown>> | undefined
  },
): Lowered =>
  lowerNode(
    options.env === undefined ? expr.node : residualizeNode(expr.node, options.env),
    options,
  )

/** A transition for one input: what each written column becomes, and the guard. */
export interface LoweredUpdate {
  readonly sets: ReadonlyArray<readonly [target: ReadonlyArray<string>, value: Sql]>
  readonly when: Sql
}

/**
 * Lower `transition` for `input`. The input is checked against the
 * transition's input Schema first: the guard and the proofs take its rules as
 * given, so an update built from an input that breaks them is refused.
 */
export const lowerUpdate = <State, Input, Emit>(
  transition: Transition<State, Input, Emit>,
  input: Input,
  dialect: SqlDialect,
): Result.Result<LoweredUpdate, SqlUnsupportedError | Refused> => {
  if (transition.writes.length === 0) {
    return Result.fail(
      new SqlUnsupportedError({
        reason: 'cannot lower a transition with no writes to a SQL UPDATE',
      }),
    )
  }
  if (Option.isSome(transition.inputSchema) && !Schema.is(transition.inputSchema.value)(input)) {
    return Result.fail(new Refused({ reason: 'the input does not satisfy the input Schema' }))
  }
  const lower = (node: Node.Node) =>
    lowerNode(residualizeNode(node, { input }), { dialect, rowPrefix: ['state'] })
  const sets: Array<readonly [ReadonlyArray<string>, Sql]> = []
  for (const write of transition.writes) {
    const value = lower(write.value.node)
    if (Result.isFailure(value)) return Result.fail(value.failure)
    sets.push([write.target, value.success])
  }
  return Result.map(lower(transition.when.node), when => ({ sets, when }))
}
