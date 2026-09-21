/**
 * data-query-DESIGN §32 Phase 10 / §20: a fourth interpreter, over LiveStore's
 * query builder.
 *
 * The three before it run the whole kernel, so §16's capability checking has
 * never had anything to refuse in earnest — TanStack declines one operator, and
 * only because of an escaping detail. This engine is genuinely narrower, and is
 * the case §16 was written for: its `where` takes a column, an operator and a
 * value, from a fixed list of `=`, `!=`, `<`, `>`, `<=`, `>=`, `LIKE` and `IN`.
 *
 * **There is no null predicate in that list at all.** `isNull` and `isNotNull`
 * are not expressible, and `x = null` is not a substitute — in SQL it is
 * unknown for every row, including the null ones. `contains` is out for the
 * same reason it is out in TanStack: `LIKE` with no `ESCAPE` makes a `%` in the
 * search a wildcard rather than a percent sign.
 *
 * So this interpreter runs `eq`, and refuses three quarters of the kernel. It
 * is a spike, not a package: §20 says LiveStore should be an interpreter with
 * explicit ownership, and §34 lists reproducing it as a non-goal.
 *
 * It compiles to SQL through LiveStore's own builder and stops there, rather
 * than standing up a store. An event-sourced store with its schema,
 * materializers and adapter would be a great deal of machinery to run one
 * operator through, and none of it is what the conformance suite is asking
 * about — which is whether the query means the same thing.
 */
import { Query as Relational, isPredicate } from 'foldkit-entity'
import type { AnyExpr, AnyQuery, Operation } from 'foldkit-entity'

export class LiveStoreCompileError extends Error {
  constructor(message: string) {
    super(`[foldkit-example-livestore] ${message}`)
    this.name = 'LiveStoreCompileError'
  }
}

/**
 * What this interpreter runs. Narrow on purpose, and narrow because the engine
 * is: see the note above for what each absence costs.
 *
 * **An operator list is not the whole of what an interpreter can run**, which
 * this engine is the first to show. Two things it refuses use no operator
 * beyond `eq`: an `eq` whose operand is another predicate, because `where`
 * takes a column and a value and has nowhere to put one; and an `eq` against
 * null, because the builder rewrites that into a null test. §16's declaration
 * is about operations, and neither of these is an operation — see
 * `LiveStoreCompileError` at the call sites.
 */
export const supported: ReadonlyArray<Operation> = ['eq']

/** A column name, or the value an operand stands for at this request. */
const operand = (node: AnyExpr, input: Readonly<Record<string, unknown>>) => {
  switch (node._tag) {
    case 'Field':
      return { column: node.key }
    case 'Literal':
      return { value: node.value }
    case 'Input':
      return { value: input[node.key] }
  }
}

/**
 * The body as a LiveStore query over `table`, rendered to SQL and its bound
 * values. Every `where` is `AND`ed by this engine, which is what a `Query`'s
 * list of predicates already means.
 */
export const compile = (
  body: AnyQuery,
  input: Readonly<Record<string, unknown>>,
  table: any,
): { readonly query: string; readonly bindValues: ReadonlyArray<unknown> } => {
  const missing = Relational.unsupported(body, supported)
  if (missing.length > 0) {
    throw new LiveStoreCompileError(
      `this interpreter does not run ${missing.join(', ')}, which the query needs`,
    )
  }

  let built = table
  for (const node of body.where) {
    if (node._tag !== 'Eq') throw new LiveStoreCompileError('only equality is compiled here')
    if (isPredicate(node.left) || isPredicate(node.right)) {
      throw new LiveStoreCompileError(
        'this engine compares a column to a value, so a predicate cannot stand on either side',
      )
    }
    const left = operand(node.left, input)
    const right = operand(node.right, input)
    const column = 'column' in left ? left.column : 'column' in right ? right.column : undefined
    const value =
      'column' in left ? (right as { value: unknown }).value : (left as { value: unknown }).value
    if (column === undefined) {
      throw new LiveStoreCompileError('this engine compares a column, not two values')
    }
    // Found by the conformance suite: this engine rewrites `where(col, '=',
    // null)` into `col IS NULL`, which matches exactly the rows an equality
    // against null must *not* match. It cannot express unknown, so the only
    // honest thing is to refuse rather than let it answer a different question.
    if (value === null || value === undefined) {
      throw new LiveStoreCompileError(
        'this engine turns an equality against null into a null test, which is not what eq means',
      )
    }
    built = built.where(column, '=', value)
  }

  for (const term of body.orderBy) {
    if (term.expr._tag !== 'Field') {
      throw new LiveStoreCompileError('this interpreter orders by fields only')
    }
    built = built.orderBy(term.expr.key, term.direction)
  }

  return built.asSql()
}
