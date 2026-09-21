/**
 * Compiles a query's body — the source-neutral `Expr` value a
 * `Query.define` carries — into the Drizzle `where` and `orderBy` this
 * package already runs.
 *
 * The body says what the query means; this says what that means *here*. A
 * binding knows which column holds which field, so nothing in the body names a
 * table, and the same body can be compiled by something else entirely.
 *
 * What this does not do is decide what a principal may see. A compiled `where`
 * is conjoined with the binding's own `visible` rule by the caller, exactly as
 * a hand-written one is: a query body is the application's question, never its
 * authorization.
 */
import { eq, type AnyColumn, type SQL } from 'drizzle-orm'
import type { AnyExpr, AnyQuery, OrderTerm as ExprOrderTerm, Predicate } from 'foldkit-entity'
import type { OrderTerm } from './cursor.js'

/** What a binding has to offer to be compiled against: a column per field key. */
export interface CompileTarget {
  readonly columns: Record<string, AnyColumn>
}

export class QueryCompileError extends Error {
  constructor(message: string) {
    super(`[foldkit-remote-drizzle] ${message}`)
    this.name = 'QueryCompileError'
  }
}

const columnFor = (target: CompileTarget, key: string, query: string): AnyColumn => {
  const column = target.columns[key]
  if (column === undefined) {
    throw new QueryCompileError(
      `query "${query}" reads the field "${key}", which the binding has no column for`,
    )
  }
  return column
}

/**
 * The value an operand contributes. A field is a column; a literal is itself;
 * an input is whatever this request was given, read by the key the placeholder
 * was built with.
 */
const operand = (
  node: AnyExpr,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): AnyColumn | unknown => {
  switch (node._tag) {
    case 'Field':
      return columnFor(target, node.key, query)
    case 'Literal':
      return node.value
    case 'Input':
      return input[node.key]
  }
}

const predicate = (
  node: Predicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL => {
  switch (node._tag) {
    case 'Eq': {
      const left = operand(node.left, target, input, query)
      const right = operand(node.right, target, input, query)
      // Drizzle's `eq` wants the column on the left; a body may compare either
      // way round, and equality does not care.
      return node.left._tag === 'Field'
        ? eq(left as AnyColumn, right)
        : eq(right as AnyColumn, left)
    }
  }
}

/**
 * The body's predicates, as the SQL fragments this request needs. Each is
 * separate: the caller conjoins them with whatever else applies, so a body
 * cannot escape the binding's visibility rule by being one big expression.
 */
export const compileWhere = (
  body: AnyQuery,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): ReadonlyArray<SQL> => body.where.map(node => predicate(node, target, input, query))

/** The body's ordering, as this package's order terms. */
export const compileOrderBy = (
  body: AnyQuery,
  target: CompileTarget,
  query: string,
): ReadonlyArray<OrderTerm> =>
  body.orderBy.map((term: ExprOrderTerm) => {
    if (term.expr._tag !== 'Field') {
      throw new QueryCompileError(
        `query "${query}" orders by something that is not a field, which this compiler cannot run yet`,
      )
    }
    return { column: columnFor(target, term.expr.key, query), direction: term.direction }
  })
