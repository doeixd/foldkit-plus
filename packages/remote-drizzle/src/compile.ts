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
import {
  eq,
  is,
  isNotNull,
  isNull,
  not,
  sql,
  type AnyColumn,
  type SQL,
  type Table,
} from 'drizzle-orm'
import { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import { Option } from 'effect'
import { Query, isPredicate } from 'foldkit-entity'
import type {
  AnyExpr,
  AnyQuery,
  EqPredicate,
  OrderTerm as ExprOrderTerm,
  Operandish,
  Operation,
  Predicate,
} from 'foldkit-entity'
import type { OrderTerm } from './cursor.js'

/**
 * What a binding has to offer to be compiled against: a column per field key,
 * and the table, whose dialect decides how text folds.
 */
export interface CompileTarget {
  readonly table: Table
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

/** A predicate used as a value: `(archived_at is not null) = ?` compares one. */
const side = (
  node: Operandish,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): AnyColumn | SQL | unknown =>
  isPredicate(node) ? predicate(node, target, input, query) : operand(node, target, input, query)

/** `%` and `_` are wildcards, so text searched for has to say it means them literally. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, found => `\\${found}`)

/**
 * `eq(somePredicate, aBoolean)` asked directly: the predicate when the boolean
 * is true, and its negation when false. `undefined` when this comparison is not
 * of that shape, which leaves it to ordinary equality.
 *
 * A `Null` negates by flipping which answer absence gives, so the SQL stays
 * `is null` / `is not null` rather than `not (… is not null)`.
 */
const truthComparison = (
  node: EqPredicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL | undefined => {
  const [asked, against] = isPredicate(node.left)
    ? [node.left, node.right]
    : isPredicate(node.right)
      ? [node.right, node.left]
      : [undefined, undefined]
  if (asked === undefined || against === undefined || isPredicate(against)) return undefined
  const value = operand(against, target, input, query)
  if (typeof value !== 'boolean') return undefined
  if (value) return predicate(asked, target, input, query)
  if (asked._tag === 'Null') {
    return predicate({ ...asked, present: !asked.present }, target, input, query)
  }
  return not(predicate(asked, target, input, query))
}

const predicate = (
  node: Predicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL => {
  switch (node._tag) {
    case 'Eq': {
      // A predicate compared to a boolean is that predicate, or its negation.
      // The value is known here — this runs per request, with the input in
      // hand — so it is settled now rather than sent to the database as a
      // boolean parameter, which dialects disagree about even having. The SQL
      // is then exactly what a hand-written `archived ? isNotNull : isNull`
      // produced, which is the point.
      const asked = truthComparison(node, target, input, query)
      if (asked !== undefined) return asked
      const left = side(node.left, target, input, query)
      const right = side(node.right, target, input, query)
      // Drizzle's `eq` wants a column or expression on the left; a body may
      // compare either way round, and equality does not care. Normalising keeps
      // the generated SQL the shape a binding would have been written in.
      return isPredicate(node.left) || node.left._tag === 'Field'
        ? eq(left as AnyColumn, right)
        : eq(right as AnyColumn, left)
    }
    case 'Null': {
      const column = operand(node.operand, target, input, query) as AnyColumn
      return node.present ? isNotNull(column) : isNull(column)
    }
    case 'Contains': {
      const value = operand(node.value, target, input, query)
      const search = side(node.search, target, input, query)
      // Preserve unknown under a surrounding boolean comparison or negation.
      if (search === null) return sql`null`
      if (typeof search !== 'string') {
        throw new QueryCompileError(`query "${query}" searches for something that is not text`)
      }
      // Postgres text cannot hold NUL and SQLite's `like` stops at it, so text
      // holding one means nothing portable; the reference interpreter refuses
      // it too. A searched value that is an input or a literal is seen here; a
      // NUL inside a stored column is not.
      const nul = String.fromCharCode(0)
      if (search.includes(nul) || (typeof value === 'string' && value.includes(nul))) {
        throw new QueryCompileError(
          `query "${query}" searches text holding a NUL character, which SQL text cannot hold portably`,
        )
      }
      // Folded on both sides rather than left to `like`, which is
      // case-insensitive in SQLite and case-sensitive in Postgres: a query body
      // that means two things by dialect is the thing this package exists to
      // stop. The fold is ASCII only, as `Expr.contains` documents and
      // `evaluate` does: SQLite's `lower` folds ASCII alone, but Postgres's
      // follows the collation (`É` to `é` under a UTF-8 one), except the `C`
      // collation, which folds ASCII alone too. Decided by the table, not the
      // operand: the searched value may be an input rather than a column.
      const pattern = `%${escapeLike(search)}%`
      return is(target.table, PgTable)
        ? sql`lower(${value} collate "C") like lower(${pattern} collate "C") escape '\\'`
        : sql`lower(${value}) like lower(${pattern}) escape '\\'`
    }
  }
}

/**
 * The operations this compiler turns into SQL. Declared rather than implied by
 * which cases `predicate` happens to handle, so a body needing something else
 * is refused with a name instead of falling through.
 */
export const supported: ReadonlyArray<Operation> = ['eq', 'isNull', 'isNotNull', 'contains']

/**
 * Every field the body reads has a column here, and every operation it needs is
 * one this compiler runs. Checked once, when the source is registered, so a
 * server that starts is a server whose queries can be answered — rather than
 * one that fails on whichever request first runs this query. Ordering is
 * checked by compiling it, which happens at registration for the same reason.
 */
export const checkFields = (body: AnyQuery, target: CompileTarget, query: string): void => {
  const missing = Query.unsupported(body, supported)
  if (missing.length > 0) {
    throw new QueryCompileError(
      `query "${query}" needs ${missing.join(', ')}, which this compiler does not run`,
    )
  }
  for (const field of Query.dependencies(body).fields) columnFor(target, field.key, query)
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

/**
 * The body's ordering for one input, as this package's order terms: a chosen
 * order resolved to the field the input names. An input naming no order it
 * offers is the request's mistake, refused as a compile error.
 */
export const compileOrderBy = (
  body: AnyQuery,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): ReadonlyArray<OrderTerm> => {
  let terms: ReadonlyArray<ExprOrderTerm>
  try {
    terms = Query.orderFor(body, input)
  } catch (error) {
    throw new QueryCompileError(`query "${query}": ${(error as Error).message}`)
  }
  return terms.map(term => {
    if (term.expr._tag !== 'Field') {
      throw new QueryCompileError(
        `query "${query}" orders by something that is not a field, which this compiler cannot run yet`,
      )
    }
    const column = columnFor(target, term.expr.key, query)
    const collation = Option.getOrUndefined(term.collation)
    if (collation?._tag === 'Locale' && !is(column, PgColumn)) {
      throw new QueryCompileError(
        `query "${query}" orders "${term.expr.key}" by the "${collation.locale}" collation, and SQLite has no locales`,
      )
    }
    return { column, direction: term.direction, nulls: term.nulls, collation }
  })
}
