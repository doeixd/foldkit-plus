/**
 * The reference interpreter: a query body run over rows already in memory.
 *
 * `foldkit-remote-drizzle` compiles a body to SQL. This runs the same body
 * directly, which is what makes "source-neutral" a fact rather than a claim —
 * the two are checked against each other over a real database, and a body that
 * means one thing here and another there is a bug in one of them.
 *
 * It is also the interpreter to reach for when there is no database: a test
 * that wants rows, or a server assembling a page from values it already holds.
 *
 * **It follows SQL, not JavaScript.** Where the two disagree this follows SQL,
 * because SQL is what the other interpreter runs. The important case is null:
 * `null = null` is unknown in SQL and a row is not matched by it, where
 * JavaScript would happily call the two equal.
 */
import type { AnyExpr, AnyQuery, OrderTerm, Predicate } from 'foldkit-entity'

/** A row as this interpreter reads one: values by field key. */
export type Row = Readonly<Record<string, unknown>>

export class QueryEvaluateError extends Error {
  constructor(message: string) {
    super(`[foldkit-remote-server] ${message}`)
    this.name = 'QueryEvaluateError'
  }
}

const valueOf = (node: AnyExpr, row: Row, input: Row): unknown => {
  switch (node._tag) {
    case 'Field':
      return row[node.key]
    case 'Literal':
      return node.value
    case 'Input':
      return input[node.key]
  }
}

/** SQL's unknown: neither true nor false, and a row is kept only on true. */
type Truth = boolean | 'unknown'

const isNull = (value: unknown): boolean => value === null || value === undefined

const holds = (node: Predicate, row: Row, input: Row): Truth => {
  switch (node._tag) {
    case 'Eq': {
      const left = valueOf(node.left, row, input)
      const right = valueOf(node.right, row, input)
      // `null = anything` is unknown in SQL, including `null = null`. A row is
      // kept only when a comparison is true, so an unknown drops it either way;
      // saying so explicitly is what keeps this honest about three-valued logic
      // rather than accidentally right about it.
      if (isNull(left) || isNull(right)) return 'unknown'
      return left === right
    }
  }
}

/** Every predicate must hold: the list is the conjunction, as it is in a `Query`. */
const matches = (body: AnyQuery, row: Row, input: Row): boolean =>
  body.where.every(node => holds(node, row, input) === true)

const compare = (left: unknown, right: unknown, query: string): number => {
  if (typeof left === 'string' && typeof right === 'string') {
    return left < right ? -1 : left > right ? 1 : 0
  }
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right)
  }
  throw new QueryEvaluateError(
    `query "${query}" orders by values this interpreter cannot compare (${typeof left} and ${typeof right})`,
  )
}

const ordered = (rows: ReadonlyArray<Row>, terms: ReadonlyArray<OrderTerm>, query: string) => {
  if (terms.length === 0) return [...rows]
  return [...rows].sort((left, right) => {
    for (const term of terms) {
      if (term.expr._tag !== 'Field') {
        throw new QueryEvaluateError(
          `query "${query}" orders by something that is not a field, which this interpreter cannot run yet`,
        )
      }
      const a = left[term.expr.key]
      const b = right[term.expr.key]
      if (isNull(a) || isNull(b)) {
        throw new QueryEvaluateError(
          `query "${query}" orders by "${term.expr.key}", which is null in a row; where nulls sort is a thing databases disagree about, so it is outside what this interpreter will answer for`,
        )
      }
      const sign = compare(a, b, query)
      if (sign !== 0) return term.direction === 'asc' ? sign : -sign
    }
    return 0
  })
}

/**
 * The rows the body matches, in the order it asks for. Pure: it reads the rows
 * it is given and nothing else.
 *
 * `input` holds the values this run was given, by the keys the body's
 * placeholders were built with — the same record the query would be called
 * with anywhere else.
 */
export const evaluate = (
  body: AnyQuery,
  input: Row,
  rows: ReadonlyArray<Row>,
  options: { readonly name?: string } = {},
): ReadonlyArray<Row> => {
  const name = options.name ?? body.entity.name
  return ordered(
    rows.filter(row => matches(body, row, input)),
    body.orderBy,
    name,
  )
}
