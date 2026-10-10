/**
 * The reference interpreter: a query body run over rows already in memory.
 *
 * `foldkit-remote-drizzle` compiles a body to SQL. This runs the same body
 * directly, which is what makes "source-neutral" a fact rather than a claim —
 * the two are checked against each other over a real database, and a body that
 * means one thing here and another there is a bug in one of them.
 *
 * It is also the interpreter to reach for when there is no database: a test
 * that wants rows, a server assembling a page from values it already holds, or
 * a client judging rows it already has.
 *
 * It lives in `foldkit-entity` because it is the **reference semantics** of the
 * IR this package owns — what §6.0.1 means operationally rather than in prose —
 * and a specification's reference implementation belongs with the
 * specification. The rule that keeps it here: **it may depend on the IR and
 * nothing else.** The moment it wants a Remote concept it has moved to the
 * wrong place and should leave.
 *
 * **It follows SQL, not JavaScript.** Where the two disagree this follows SQL,
 * because SQL is what the other interpreter runs. The important case is null:
 * `null = null` is unknown in SQL and a row is not matched by it, where
 * JavaScript would happily call the two equal.
 */
import { Option } from 'effect'
import type { Collation } from './collation.js'
import { Query, isPredicate } from './expr.js'
import type { AnyExpr, AnyQuery, Operandish, Operation, OrderTerm, Predicate } from './expr.js'

/** A row as this interpreter reads one: values by field key. */
export type Row = Readonly<Record<string, unknown>>

export class QueryEvaluateError extends Error {
  constructor(message: string) {
    super(`[foldkit-entity] ${message}`)
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

/**
 * Lowercases ASCII letters and leaves every other character as it is, which is
 * what SQLite's `lower` does without ICU and so what the compiled SQL folds to.
 * `toLowerCase` would fold `É` to `é` here and not there.
 */
const foldAscii = (text: string): string => text.replace(/[A-Z]+/g, upper => upper.toLowerCase())

const NUL = String.fromCharCode(0)

/** A predicate used as a value is its own truth; anything else is its value. */
const sideOf = (node: Operandish, row: Row, input: Row): unknown =>
  isPredicate(node) ? truthValue(holds(node, row, input)) : valueOf(node, row, input)

/**
 * A predicate compared as a value. SQL's unknown is null there too, so an
 * unknown compared to anything stays unknown rather than becoming false.
 */
const truthValue = (truth: Truth): unknown => (truth === 'unknown' ? null : truth)

const holds = (node: Predicate, row: Row, input: Row): Truth => {
  switch (node._tag) {
    case 'Eq': {
      const left = sideOf(node.left, row, input)
      const right = sideOf(node.right, row, input)
      // `null = anything` is unknown in SQL, including `null = null`. A row is
      // kept only when a comparison is true, so an unknown drops it either way;
      // saying so explicitly is what keeps this honest about three-valued logic
      // rather than accidentally right about it.
      if (isNull(left) || isNull(right)) return 'unknown'
      return left === right
    }
    case 'Null':
      // The one comparison that is never unknown: asking whether a value is
      // absent always has an answer.
      return isNull(valueOf(node.operand, row, input)) !== node.present
    case 'Contains': {
      const value = valueOf(node.value, row, input)
      const search = sideOf(node.search, row, input)
      // `null like anything` is unknown, which is why an empty search is not
      // the same as no filter over a column that can be null.
      if (isNull(value) || isNull(search)) return 'unknown'
      if (typeof value !== 'string' || typeof search !== 'string') {
        throw new QueryEvaluateError('a containment test was given something that is not text')
      }
      // Postgres text cannot hold NUL and SQLite's `like` stops at it, so no
      // two interpreters agree on such a value: refused rather than answered.
      if (value.includes(NUL) || search.includes(NUL)) {
        throw new QueryEvaluateError(
          'a containment test was given text holding a NUL character, which SQL text cannot hold portably',
        )
      }
      // Case-insensitive for ASCII letters only, because that is what
      // `Expr.contains` documents and what the compiled SQL folds both sides to.
      return foldAscii(value).includes(foldAscii(search))
    }
  }
}

/** Every predicate must hold: the list is the conjunction, as it is in a `Query`. */
const matches = (body: AnyQuery, row: Row, input: Row): boolean =>
  body.where.every(node => holds(node, row, input) === true)

/** The kinds of value this interpreter orders by; every key of one term must share one. */
const comparable = new Set(['string', 'number', 'boolean'])

/**
 * Text by code point, as SQLite's `BINARY` and Postgres's `"C"` compare it.
 * JavaScript's `<` compares UTF-16 code units, which puts a character past
 * U+FFFF (two units, the first from U+D800) before U+E000 to U+FFFF, where
 * every byte-ordered backend puts it after.
 */
const byCodePoint = (left: string, right: string): number => {
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    const a = left.codePointAt(i)!
    const b = right.codePointAt(j)!
    if (a !== b) return a < b ? -1 : 1
    i += a > 0xffff ? 2 : 1
    j += b > 0xffff ? 2 : 1
  }
  return i < left.length ? 1 : j < right.length ? -1 : 0
}

/** Two keys of one term, text by its collation (code point when none is declared). */
const compare = (left: unknown, right: unknown, collation: Option.Option<Collation>): number => {
  if (typeof left === 'string' && typeof right === 'string') {
    const fold = Option.exists(collation, declared => declared._tag === 'AsciiFold')
    return fold ? byCodePoint(foldAscii(left), foldAscii(right)) : byCodePoint(left, right)
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right)
  }
  return (left as number) - (right as number)
}

/**
 * Refuses an ordering this interpreter will not answer for, before sorting, so
 * the refusal names the first offending row in row order rather than whichever
 * pair the engine's sort happened to compare first. Every term is checked over
 * every row: a key whose kind differs from the first present one's. A null key
 * is not refused; the term says where it goes.
 */
const checkOrder = (rows: ReadonlyArray<Row>, terms: ReadonlyArray<OrderTerm>, query: string) => {
  for (const term of terms) {
    if (term.expr._tag !== 'Field') {
      throw new QueryEvaluateError(
        `query "${query}" orders by something that is not a field, which this interpreter cannot run yet`,
      )
    }
    if (Option.exists(term.collation, declared => declared._tag === 'Locale')) {
      throw new QueryEvaluateError(
        `query "${query}" orders "${term.expr.key}" by a backend's locale collation, which only that backend has`,
      )
    }
    const key = term.expr.key
    let first: string | undefined
    for (const row of rows) {
      const value = row[key]
      if (isNull(value)) continue
      const kind = typeof value
      first ??= kind
      if (kind !== first || !comparable.has(kind)) {
        throw new QueryEvaluateError(
          `query "${query}" orders by values this interpreter cannot compare (${first} and ${kind})`,
        )
      }
    }
  }
}

/** Two rows by checked terms: negative when `left` sorts first. */
const byTerms = (terms: ReadonlyArray<OrderTerm>, left: Row, right: Row): number => {
  for (const term of terms) {
    const key = (term.expr as Extract<OrderTerm['expr'], { readonly _tag: 'Field' }>).key
    const absentLeft = isNull(left[key])
    const absentRight = isNull(right[key])
    // Where a row without a value goes is the term's to say, whichever the
    // direction; two such rows tie, for the next term.
    if (absentLeft || absentRight) {
      if (absentLeft && absentRight) continue
      return absentLeft === (term.nulls === 'first') ? -1 : 1
    }
    const sign = compare(left[key], right[key], term.collation)
    if (sign !== 0) return term.direction === 'asc' ? sign : -sign
  }
  return 0
}

const ordered = (rows: ReadonlyArray<Row>, terms: ReadonlyArray<OrderTerm>, query: string) => {
  // One row, or none, is in order whatever its keys hold.
  if (terms.length === 0 || rows.length < 2) return [...rows]
  checkOrder(rows, terms, query)
  return [...rows].sort((left, right) => byTerms(terms, left, right))
}

/**
 * Where `left` sorts against `right` under these terms (`Query.orderFor`'s),
 * as `evaluate` sorts: negative when it comes first. Refuses what `evaluate`
 * refuses, for these two rows: a term not over a field, a locale collation,
 * or keys of different kinds. For a client placing one row among others it
 * holds.
 */
export const compareRows = (
  terms: ReadonlyArray<OrderTerm>,
  left: Row,
  right: Row,
  query: string,
): number => {
  checkOrder([left, right], terms, query)
  return byTerms(terms, left, right)
}

/**
 * The operations this interpreter runs. It is the reference, so this is the
 * whole kernel — but it is declared rather than assumed, because an
 * interpreter that gains an operator and forgets to say so is exactly what
 * `Query.unsupported` exists to catch.
 */
export const supported: ReadonlyArray<Operation> = ['eq', 'isNull', 'isNotNull', 'contains']

/**
 * Refuses a body needing an operation this interpreter does not run, rather
 * than skipping it and answering a different question. Called by `evaluate`;
 * call it directly to check a body once instead of on every run.
 */
export const assertSupported = (body: AnyQuery): void => {
  const missing = Query.unsupported(body, supported)
  if (missing.length > 0) {
    throw new QueryEvaluateError(
      `this interpreter does not run ${missing.join(', ')}, which query "${body.entity.name}" needs`,
    )
  }
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
): ReadonlyArray<Row> => {
  assertSupported(body)
  return ordered(
    rows.filter(row => matches(body, row, input)),
    Query.orderFor(body, input),
    body.entity.name,
  )
}
