/**
 * Equality, nulls, membership and the connectives, as metakit's own
 * operations: `eq.equals` and `eq.among` (SQL's `=` and `in`, null-giving),
 * `null.isNull`, and Kleene's `bool.and`, `bool.or`, `bool.not`.
 */
import { Bool, Eq, Node, Null } from '@doeixd/metakit'
import { kindOf } from './kind.js'
import {
  exprOf,
  made,
  maxQueryNodes,
  originOf,
  toNode,
  type Expr,
  type InputExpr,
  type Invalid,
  type Operand,
  type PlainValue,
  type Predicate,
  type Reads,
  type ReadsOf,
  type ValueOf,
} from './operand.js'
import { Option } from 'effect'

/** Intersected onto the subject of a step, so a value that does not fit it is refused at the step. */
export type Fits<Right, Allowed, Name extends string> = [Right] extends [Allowed]
  ? unknown
  : Invalid<`foldkit-entity: ${Name} was given a value that does not fit the operand it is applied to`>

/** What `Expr.eq` accepts on the right, typed from its left: a path or a nullable value may give null. */
type EqRight<L> =
  | ValueOf<L>
  | Expr<ValueOf<L>>
  | Expr<ValueOf<L> | null>
  | (boolean extends ValueOf<L> ? Predicate : never)

const call = (op: Node.Op, args: ReadonlyArray<Node.Node>): Node.Node => Node.Call({ op, args })

/**
 * Two values are the same: a field (or an expression) on the left, and the
 * value on the right, typed from it. Fields and plain values are coerced, so
 * the common form reads as it means:
 *
 * ```ts
 * Expr.eq(Post.fields.slug, input.slug)
 * Expr.eq(Post.fields.status, 'active')
 * ```
 *
 * As SQL's `=`: a null on either side gives null, so the row is matched by
 * neither this nor its `not`.
 */
const eqCall = <
  L extends Operand<any> | PlainValue,
  R extends (L extends PlainValue
    ? Invalid<'foldkit-entity: Expr.eq takes the field on the left and the value on the right'>
    : EqRight<L>),
>(
  left: L,
  // The right side is typed from the left, so a plain value on the left has
  // nothing to type it by: say so, rather than that 3 is no `Operand`.
  right: R,
): Predicate & Reads<ReadsOf<L> | ReadsOf<R>> =>
  exprOf(call(Eq.equalsOp, [toNode(left), toNode(right)]))

/** `Expr.eq.step`: the right side, then the left. */
export type EqStep = <const R>(
  right: R,
) => <L extends Operand<any>>(
  left: L & Fits<R, EqRight<L>, 'Expr.eq.step'>,
) => Predicate & Reads<ReadsOf<L> | ReadsOf<R>>

export const eq = Object.assign(eqCall, {
  step: ((right: unknown) => (left: unknown) => eqCall(left as never, right as never)) as EqStep,
})

/**
 * Whether a value is absent. Of a predicate, whether it is unknown. Its
 * opposite is `isNotNull`, which has no unknown for a `not` to keep.
 */
export const isNull = <L extends Operand<any>>(operand: L): Predicate & Reads<ReadsOf<L>> =>
  exprOf(call(Null.isNullOp, [toNode(operand)]))

/** Whether a value is present. */
export const isNotNull = <L extends Operand<any>>(operand: L): Predicate & Reads<ReadsOf<L>> => {
  const node = toNode(operand)
  return exprOf(
    made(call(Bool.notOp, [call(Null.isNullOp, [node])]), { _tag: 'NotNull', operand: node }),
  )
}

const inCall = <L extends Operand<any>>(
  value: L,
  among: ReadonlyArray<ValueOf<L>> | Expr<ReadonlyArray<ValueOf<L>>>,
): Predicate & Reads<ReadsOf<L>> =>
  exprOf(
    call(Eq.amongOp, [
      toNode(value),
      Array.isArray(among) ? Node.Lit({ value: Object.freeze([...among]) }) : toNode(among),
    ]),
  )

/** `Expr.in.step`: the list or its input, then the value. */
export type InStep = <const R extends ReadonlyArray<unknown> | Expr<ReadonlyArray<unknown>>>(
  among: R,
) => <L extends Operand<any>>(
  value: L & Fits<R, ReadonlyArray<ValueOf<L>> | Expr<ReadonlyArray<ValueOf<L>>>, 'Expr.in.step'>,
) => Predicate & Reads<ReadsOf<L>>

/**
 * Whether a value is one of `among`: a list written out, or an input whose
 * value is one. Each element is compared as `eq` compares.
 *
 * ```ts
 * Expr.in(Todo.fields.projectId, input.projectIds)
 * Expr.in(Todo.fields.status, ['open', 'blocked'])
 * ```
 *
 * As SQL's `in`: a null value is unknown, as is no match against a list
 * holding a null, and an empty list matches no row. A list written out is
 * copied, so changing the array afterwards does not change the query.
 */
export const inAmong = Object.assign(inCall, {
  step: ((among: ReadonlyArray<unknown> | Expr<ReadonlyArray<unknown>>) => (value: Operand<any>) =>
    inCall(value, among as never)) as InStep,
})

/** The operands of a chain of `op` that `Expr.and` or `Expr.or` built, in order. */
export const chained = (op: Node.Op, node: Node.Node): ReadonlyArray<Node.Node> =>
  Node.$is('Call')(node) && node.op === op && Option.isNone(originOf(node))
    ? node.args.flatMap(arg => chained(op, arg))
    : [node]

/** A connective's operands, each checked to be a predicate, with one of the same kind flattened in. */
const connected = (
  step: 'and' | 'or',
  op: Node.Op,
  given: ReadonlyArray<unknown>,
): ReadonlyArray<Node.Node> => {
  const operands = given.flatMap(operand => {
    const node = toNode(operand)
    if (kindOf(node) !== 'boolean') {
      throw new Error(
        `[foldkit-entity] Expr.${step}: every operand is a predicate; compare a value with Expr.eq first`,
      )
    }
    return chained(op, node)
  })
  // Flattening copies a shared operand's list, so `or(x, x)` built thirty deep
  // would be 2^30 operands before the budget ever counts them.
  if (operands.length > maxQueryNodes) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: more than ${maxQueryNodes} operands, the most a query's predicates may hold`,
    )
  }
  if (operands.length === 0) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: no operands, which would match ${step === 'and' ? 'every row' : 'no row'}; check a list is non-empty before spreading it`,
    )
  }
  return operands
}

/** `Expr.and` and `Expr.or`: one operand is that operand, and two or more are one predicate. */
interface Connective {
  <P extends Predicate>(only: P): P
  <A extends Predicate, B extends Predicate, Rest extends ReadonlyArray<Predicate>>(
    first: A,
    second: B,
    ...rest: Rest
  ): Predicate & Reads<ReadsOf<A> | ReadsOf<B> | ReadsOf<Rest[number]>>
  (...operands: readonly [Predicate, ...Array<Predicate>]): Predicate
}

const connective =
  (step: 'and' | 'or', op: Node.Op): Connective =>
  (...given: ReadonlyArray<Predicate>): never => {
    const [only, ...rest] = given
    if (only !== undefined && rest.length === 0 && kindOf(only.node) === 'boolean') {
      return only as never
    }
    const operands = connected(step, op, given)
    return exprOf(operands.reduce((left, right) => call(op, [left, right]))) as never
  }

/**
 * Every operand holds, as one predicate to place inside another: `where`'s
 * list is already a conjunction, so this is for `or(and(a, b), c)`. Unknown as
 * SQL's `and` is: false wins over unknown, which wins over true. Needs an
 * operand; an empty `and` would match every row.
 */
export const and: Connective = connective('and', Bool.andOp)

/**
 * At least one operand holds:
 *
 * ```ts
 * Expr.or(Expr.contains(fields.description, input.search), Expr.contains(fields.upc, input.search))
 * ```
 *
 * Unknown as SQL's `or` is: true wins over unknown, which wins over false.
 * Needs an operand, since an empty `or` would match no row.
 */
export const or: Connective = connective('or', Bool.orOp)

/**
 * The operand does not hold. **A null is matched by neither side**:
 * `not(eq(status, 'draft'))` leaves out a row whose `status` is null, since
 * `null = 'draft'` is unknown and so is its `not`, as in SQL. "Everything but
 * drafts" over a nullable column is
 * `Expr.or(Expr.isNull(status), Expr.not(Expr.eq(status, 'draft')))`.
 */
export const not = <P extends Predicate>(operand: P): Predicate & Reads<ReadsOf<P>> => {
  const node = toNode(operand)
  if (kindOf(node) !== 'boolean') {
    throw new Error(
      '[foldkit-entity] Expr.not: the operand is a predicate; compare a value with Expr.eq first',
    )
  }
  return exprOf(call(Bool.notOp, [node]))
}

/**
 * `then` holds wherever `condition` does: exactly `Expr.or(Expr.not(condition),
 * then)`. It is how a rule binds only some rows, "while open, the balance is
 * not negative":
 *
 * ```ts
 * Expr.implies(Expr.eq(after.status, 'open'), Expr.gte(after.balance, 0))
 * ```
 */
export const implies = <A extends Predicate, B extends Predicate>(
  condition: A,
  then: B,
): Predicate & Reads<ReadsOf<A> | ReadsOf<B>> =>
  // `Reads` is type-only: the `not` reads what the condition does.
  or(not(condition), then) as Predicate & Reads<ReadsOf<A> | ReadsOf<B>>

/**
 * A filter that applies only when its input is given: `or(isNull($x), …)`,
 * with the predicate built from the input as never null.
 *
 * ```ts
 * // Every product, or those of the chosen status.
 * Expr.whenGiven(input.status, status => Expr.eq(fields.status, status))
 * ```
 *
 * A reader that runs per request, as the Drizzle compiler does, decides
 * `isNull($x)` before writing SQL, so this compiles to `true`, which filters
 * nothing, or to the predicate alone.
 */
export const whenGiven = <T, P extends Predicate>(
  input: InputExpr<T>,
  build: (given: InputExpr<NonNullable<T>>) => P,
): Predicate & Reads<ReadsOf<P>> =>
  // The predicate only decides a row when the input is not null: when it is,
  // `isNull` is true and so is the `or`. That is what the narrowed type says.
  or(isNull(input), build(input as unknown as InputExpr<NonNullable<T>>))
