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
import { eq, inArray, isNull, not, type Collection } from '@tanstack/db'
import { Option } from 'effect'
import { absurd } from 'effect/Function'
import { Query as Relational } from 'foldkit-entity'
import type { AnyExpr, AnyQuery, Operation } from 'foldkit-entity'

/** An expression's node: what this engine reads. */
type ExprNode = AnyExpr['node']

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
export const supported: ReadonlyArray<Operation> = ['eq', 'isNull', 'isNotNull', 'in']

/** What an operand contributes: a row reference, or the value it stands for. */
const operand = (node: ExprNode, row: any, input: Readonly<Record<string, unknown>>): unknown => {
  switch (node._tag) {
    case 'Lit':
      return node.value
    case 'Path': {
      const [slice, key] = node.segments
      if (slice === 'row' && node.segments.length === 2) return row[key!]
      if (slice === 'input' && node.segments.length === 2) return input[key!]
      // Refused before compiling, as unsupported: this engine reads stored rows only.
      if (slice === 'next') throw new TanstackCompileError('this engine judges stored rows only')
      // Refused before compiling, as unsupported: this engine is given no context.
      if (slice === 'now' || (slice === 'viewer' && node.segments.length === 3)) {
        throw new TanstackCompileError('this engine reads no viewer and no clock')
      }
      // Refused before compiling, as unsupported: this engine reads one collection.
      throw new TanstackCompileError('this engine reads no other row')
    }
    // A defined operator is already its body, so a call left is an operator with no definition.
    case 'Call':
      throw new TanstackCompileError(`the operator "${node.op.id}" has no definition to run`)
    case 'If':
    case 'Match':
    case 'Opaque':
    case 'Rows':
      throw new TanstackCompileError('this engine reads no other row')
    default:
      return absurd(node)
  }
}

/** Whether `node` is a predicate: a call that gives a truth. */
const isPredicateNode = (node: ExprNode): boolean =>
  node._tag === 'Call' && node.op.returns === 'boolean'

const side = (node: ExprNode, row: any, input: Readonly<Record<string, unknown>>): unknown =>
  isPredicateNode(node) ? predicate(node, row, input) : operand(node, row, input)

const predicate = (node: ExprNode, row: any, input: Readonly<Record<string, unknown>>): unknown => {
  if (node._tag !== 'Call') {
    throw new TanstackCompileError(`${node._tag} is not run by this interpreter as a predicate`)
  }
  const [first, second] = node.args
  const missing = (): never => {
    throw new TanstackCompileError(`${node.op.id} is called with too few arguments`)
  }
  switch (node.op.id) {
    case 'eq.equals': {
      if (first === undefined || second === undefined) return missing()
      // A predicate compared to a boolean is that predicate or its negation,
      // settled here rather than asked of the engine — the same reason the SQL
      // compiler settles it: the value is known at query time.
      const [asked, against] = isPredicateNode(first)
        ? [first, second]
        : isPredicateNode(second)
          ? [second, first]
          : [undefined, undefined]
      if (asked !== undefined && against !== undefined && !isPredicateNode(against)) {
        const value = operand(against, row, input)
        if (typeof value === 'boolean') {
          const built = predicate(asked, row, input)
          return value ? built : not(built as never)
        }
      }
      return eq(side(first, row, input) as never, side(second, row, input) as never)
    }
    case 'null.isNull':
      if (first === undefined) return missing()
      return isNull(operand(first, row, input) as never)
    case 'bool.not': {
      // `isNotNull` is a `not` of `isNull`; any other `not` is refused.
      if (first !== undefined && first._tag === 'Call' && first.op.id === 'null.isNull') {
        return not(predicate(first, row, input) as never)
      }
      throw new TanstackCompileError('bool.not is not run by this interpreter')
    }
    case 'str.contains':
      throw new TanstackCompileError(
        'contains is not run by this interpreter: ilike has no escape, so a search containing % or _ would match as a wildcard',
      )
    case 'eq.among': {
      if (first === undefined || second === undefined) return missing()
      const among = operand(second, row, input)
      // An empty list is false whatever the value, as in SQL; this engine
      // reads a null against one as unknown, so it is settled here, where the
      // list is known.
      if (Array.isArray(among) && among.length === 0) return eq(0 as never, 1 as never)
      return inArray(operand(first, row, input) as never, among as never)
    }
    case 'bool.and':
    case 'bool.or':
    case 'ord.lt':
    case 'ord.lte':
    case 'ord.gt':
    case 'ord.gte':
    case 'str.lt':
    case 'str.lte':
    case 'str.gt':
    case 'str.gte':
      // Refused before compiling, as unsupported, so never reached; said rather than dropped.
      throw new TanstackCompileError(`${node.op.id} is not run by this interpreter`)
    default:
      throw new TanstackCompileError(`the operator "${node.op.id}" has no definition to run`)
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
  for (const written of body.where) {
    const node = written.node
    built = built.where(({ row }: { row: any }) => predicate(node, row, input))
  }
  // One `orderBy` per term, chained: this engine takes a single expression and
  // a direction, and reads an earlier call as the more significant sort — the
  // same rule `Query.orderBy` composes by.
  for (const term of Relational.orderFor(body, input)) {
    const termNode = term.expr.node
    if (
      termNode._tag !== 'Path' ||
      termNode.segments[0] !== 'row' ||
      termNode.segments.length !== 2
    ) {
      throw new TanstackCompileError('this interpreter orders by fields only')
    }
    const key = termNode.segments[1]!
    // A declared collation is honoured or refused. `binary` is this engine's
    // `lexical`, JavaScript's `<`: by UTF-16 code unit, which is code point
    // order except for a character past U+FFFF against one from U+E000 to
    // U+FFFF, a range the conformance suite does not reach. `asciiFold` is
    // refused: this engine's `lower` folds every letter, not ASCII alone.
    // Text with no declared collation sorts by locale, as it would for anyone.
    const collation = Option.getOrUndefined(term.collation)
    if (collation !== undefined && collation._tag !== 'Binary') {
      throw new TanstackCompileError(
        `this engine cannot order "${key}" by the ${collation._tag} collation the query declares`,
      )
    }
    built = built.orderBy(({ row }: { row: any }) => row[key], {
      direction: term.direction,
      nulls: term.nulls,
      ...(collation === undefined ? {} : { stringSort: 'lexical' as const }),
    })
  }
  return built
}
