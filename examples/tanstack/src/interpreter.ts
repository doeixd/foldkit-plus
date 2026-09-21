/**
 * data-query-DESIGN §32 Phase 9 / §19: a third interpreter, to find out what
 * the semantics do not say.
 *
 * `foldkit-remote-drizzle` compiles a query body to SQL and
 * `foldkit-remote-server` runs it over rows. Both were written here, against
 * one reading of §6.0.1 — which §33.1 says is not portability. This compiles
 * the same body to TanStack DB's query builder, a local incremental engine
 * that was not written here and does not know Foldkit exists.
 *
 * It is a spike, not a package. §19 is explicit that TanStack DB should be an
 * execution engine rather than something to reproduce, and §34 lists
 * reproducing it as a non-goal. What is worth having is the answer to one
 * question: does a body mean the same thing to an engine nobody here designed?
 */
import { and, eq, isNull, not, type Collection } from '@tanstack/db'
import { Query as Relational, isPredicate } from 'foldkit-entity'
import type { AnyExpr, AnyQuery, Operandish, Operation, Predicate } from 'foldkit-entity'

/** A row as this engine holds one. */
export type Row = Record<string, unknown> & { readonly id: string }

export class TanstackCompileError extends Error {
  constructor(message: string) {
    super(`[foldkit-example-tanstack] ${message}`)
    this.name = 'TanstackCompileError'
  }
}

/**
 * The operations this interpreter runs.
 *
 * **`contains` is not among them, and that is the finding.** TanStack DB's
 * `like`/`ilike` take a pattern, and `%` and `_` in it are wildcards with no
 * `ESCAPE` clause to turn them back into text. `Expr.contains` says it searches
 * for what it was given *literally* — a `%` matches a percent sign — so this
 * engine cannot answer it without changing what it means.
 *
 * Declaring it unsupported is the whole point of §16: the alternative is
 * emitting `ilike('%' + search + '%')` and quietly answering a different
 * question for any search containing a wildcard, which every conformance case
 * whose search is ordinary text would still pass.
 */
export const supported: ReadonlyArray<Operation> = ['eq', 'isNull', 'isNotNull']

/** What an operand contributes: a row reference, or the value it stands for. */
const operand = (node: AnyExpr, row: any, input: Readonly<Record<string, unknown>>): unknown => {
  switch (node._tag) {
    case 'Field':
      return row[node.key]
    case 'Literal':
      return node.value
    case 'Input':
      return input[node.key]
  }
}

const side = (node: Operandish, row: any, input: Readonly<Record<string, unknown>>): unknown =>
  isPredicate(node) ? predicate(node, row, input) : operand(node, row, input)

const predicate = (
  node: Predicate,
  row: any,
  input: Readonly<Record<string, unknown>>,
): unknown => {
  switch (node._tag) {
    case 'Eq': {
      // A predicate compared to a boolean is that predicate or its negation,
      // settled here rather than asked of the engine — the same reason the SQL
      // compiler settles it: the value is known at query time.
      const [asked, against] = isPredicate(node.left)
        ? [node.left, node.right]
        : isPredicate(node.right)
          ? [node.right, node.left]
          : [undefined, undefined]
      if (asked !== undefined && against !== undefined && !isPredicate(against)) {
        const value = operand(against, row, input)
        if (typeof value === 'boolean') {
          const built = predicate(asked, row, input)
          return value ? built : not(built as never)
        }
      }
      return eq(side(node.left, row, input) as never, side(node.right, row, input) as never)
    }
    case 'Null': {
      const absent = isNull(operand(node.operand, row, input) as never)
      return node.present ? not(absent as never) : absent
    }
    case 'Contains':
      throw new TanstackCompileError(
        'contains is not run by this interpreter: ilike has no escape, so a search containing % or _ would match as a wildcard',
      )
  }
}

/**
 * The body as a TanStack live query over `collection`, returning the matching
 * ids in the order the body asks for.
 *
 * Refuses before compiling anything, rather than skipping an operation it does
 * not implement — see `supported`.
 */
export const run = (
  body: AnyQuery,
  input: Readonly<Record<string, unknown>>,
  collection: Collection<Row, string, {}>,
  query: any,
): ReadonlyArray<string> => {
  const missing = Relational.unsupported(body, supported)
  if (missing.length > 0) {
    throw new TanstackCompileError(
      `this interpreter does not run ${missing.join(', ')}, which the query needs`,
    )
  }

  let built = query.from({ row: collection })
  for (const node of body.where) {
    built = built.where(({ row }: { row: any }) => predicate(node, row, input))
  }
  // One `orderBy` per term, chained: this engine takes a single expression and
  // a direction, and reads an earlier call as the more significant sort — the
  // same rule `Query.orderBy` composes by.
  for (const term of body.orderBy) {
    if (term.expr._tag !== 'Field') {
      throw new TanstackCompileError('this interpreter orders by fields only')
    }
    const key = term.expr.key
    // This engine's own collation is used, not overridden. Running the
    // conformance suite here is what found that text ordering had no stated
    // collation at all; §6.0.1 now puts it outside the conformant subset,
    // because no rule exists that SQLite, Postgres and this engine can all be
    // held to. So this sorts by locale, as it would for anyone using it.
    built = built.orderBy(({ row }: { row: any }) => row[key], term.direction)
  }
  return built
}

/** Conjunction, kept for the shape the engine expects when one is needed. */
export const conjoin = and
