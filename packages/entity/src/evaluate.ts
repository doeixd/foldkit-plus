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
import { Match, Option } from 'effect'
import { absurd } from 'effect/Function'
import type { Collation } from './collation.js'
import { Query, dependenciesOf, isPredicate } from './expr.js'
import type { AnyExpr, AnyQuery, Operandish, Operation, OrderTerm, Predicate } from './expr.js'

/** A row as this interpreter reads one: values by field key. */
export type Row = Readonly<Record<string, unknown>>

export class QueryEvaluateError extends Error {
  constructor(message: string) {
    super(`[foldkit-entity] ${message}`)
    this.name = 'QueryEvaluateError'
  }
}

/**
 * What a predicate is judged over: the row, the input it was given, and the row
 * a write would leave, which an invariant reads (`Next`).
 */
interface Scope {
  readonly row: Row
  readonly input: Row
  readonly next: Row
}

const valueOf = (node: AnyExpr, scope: Scope): unknown => {
  switch (node._tag) {
    case 'Field':
      return scope.row[node.key]
    case 'Next':
      return scope.next[node.field.key]
    case 'Literal':
      return node.value
    case 'Input':
      return scope.input[node.key]
    default:
      return absurd(node)
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

/**
 * Whether `value` is text holding a NUL, which Postgres text cannot hold and
 * SQLite compares only up to: no two interpreters agree on it.
 */
const holdsNul = (value: unknown): boolean => typeof value === 'string' && value.includes(NUL)

/** A predicate used as a value is its own truth; anything else is its value. */
const sideOf = (node: Operandish, scope: Scope): unknown =>
  isPredicate(node) ? truthValue(holds(node, scope)) : valueOf(node, scope)

/**
 * A predicate compared as a value. SQL's unknown is null there too, so an
 * unknown compared to anything stays unknown rather than becoming false.
 */
const truthValue = (truth: Truth): unknown => (truth === 'unknown' ? null : truth)

const holds = (node: Predicate, scope: Scope): Truth => {
  switch (node._tag) {
    case 'Eq': {
      const left = sideOf(node.left, scope)
      const right = sideOf(node.right, scope)
      // `null = anything` is unknown in SQL, including `null = null`. A row is
      // kept only when a comparison is true, so an unknown drops it either way;
      // saying so explicitly is what keeps this honest about three-valued logic
      // rather than accidentally right about it.
      if (isNull(left) || isNull(right)) return 'unknown'
      if (holdsNul(left) || holdsNul(right)) {
        throw new QueryEvaluateError(
          'an equality was given text holding a NUL character, which SQL text cannot hold portably',
        )
      }
      return left === right
    }
    case 'Null':
      // The one comparison that is never unknown: asking whether a value is
      // absent always has an answer.
      return isNull(valueOf(node.operand, scope)) !== node.present
    case 'Contains': {
      const value = valueOf(node.value, scope)
      const search = sideOf(node.search, scope)
      // `null like anything` is unknown, which is why an empty search is not
      // the same as no filter over a column that can be null.
      if (isNull(value) || isNull(search)) return 'unknown'
      if (typeof value !== 'string' || typeof search !== 'string') {
        throw new QueryEvaluateError('a containment test was given something that is not text')
      }
      // Postgres text cannot hold NUL and SQLite's `like` stops at it, so no
      // two interpreters agree on such a value: refused rather than answered.
      if (holdsNul(value) || holdsNul(search)) {
        throw new QueryEvaluateError(
          'a containment test was given text holding a NUL character, which SQL text cannot hold portably',
        )
      }
      // Case-insensitive for ASCII letters only, because that is what
      // `Expr.contains` documents and what the compiled SQL folds both sides to.
      return foldAscii(value).includes(foldAscii(search))
    }
    case 'In': {
      const among = valueOf(node.among, scope)
      if (!Array.isArray(among)) {
        throw new QueryEvaluateError('a membership test was given a list that is not a list')
      }
      // SQL's `in`: an empty list is false whatever the value, then a null
      // value is unknown, a match is true, and no match against a list
      // holding a null is unknown, since that null might have been it.
      if (among.length === 0) return false
      const value = valueOf(node.value, scope)
      if (holdsNul(value) || among.some(holdsNul)) {
        throw new QueryEvaluateError(
          'a membership test was given text holding a NUL character, which SQL text cannot hold portably',
        )
      }
      if (isNull(value)) return 'unknown'
      if (among.some(each => each === value)) return true
      return among.some(isNull) ? 'unknown' : false
    }
    // Every operand is asked, with no short cut: SQL fixes no order, so one
    // that refuses its value (a NUL) refuses here whichever operand decided.
    case 'And': {
      const truths = node.operands.map(operand => holds(operand, scope))
      if (truths.includes(false)) return false
      return truths.includes('unknown') ? 'unknown' : true
    }
    case 'Or': {
      const truths = node.operands.map(operand => holds(operand, scope))
      if (truths.includes(true)) return true
      return truths.includes('unknown') ? 'unknown' : false
    }
    case 'Not': {
      const truth = holds(node.operand, scope)
      return truth === 'unknown' ? 'unknown' : !truth
    }
    case 'Compare': {
      const left = valueOf(node.left, scope)
      const right = valueOf(node.right, scope)
      if (isNull(left) || isNull(right)) return 'unknown'
      if (holdsNul(left) || holdsNul(right)) {
        throw new QueryEvaluateError(
          'a comparison was given text holding a NUL character, which SQL text cannot hold portably',
        )
      }
      // Numbers with numbers and text with text, as `orderBy` compares them,
      // so a comparison and an ordering never disagree about what is first.
      const kind = typeof left
      if (kind !== typeof right || (kind !== 'number' && kind !== 'string')) {
        throw new QueryEvaluateError('a comparison was given values that do not order together')
      }
      const order = compare(left, right, node.collation)
      return Match.value(node.operator).pipe(
        Match.when('lt', () => order < 0),
        Match.when('lte', () => order <= 0),
        Match.when('gt', () => order > 0),
        Match.when('gte', () => order >= 0),
        Match.exhaustive,
      )
    }
  }
}

/** What a predicate comes to: SQL's three values, of which a row is kept only on `true`. */
export type PredicateTruth = Truth

/** Whether a predicate reads a field, asked once per node: nodes are frozen. */
const readsAField = new WeakMap<Predicate, boolean>()

/**
 * A predicate's truth from the input alone, when it reads no field; none when
 * it reads one. An interpreter that runs per request decides such a predicate
 * before it builds anything: `isNull($status)` is known before any row is.
 * Refuses what `evaluate` refuses (text holding a NUL).
 */
export const decided = (node: Predicate, input: Row): Option.Option<PredicateTruth> => {
  let reads = readsAField.get(node)
  if (reads === undefined) {
    // A field after a write is a field too: nothing in the input alone decides it.
    const read = dependenciesOf(node)
    reads = read.fields.length + read.next.length > 0
    readsAField.set(node, reads)
  }
  return reads ? Option.none() : Option.some(holds(node, { row: {}, input, next: {} }))
}

/** A predicate's truth over one row (and, for an invariant, the row after a write): SQL's three values. */
export const truthOver = (
  node: Predicate,
  row: Row,
  input: Row = {},
  next: Row = {},
): PredicateTruth => holds(node, { row, input, next })

/** Every predicate must hold: the list is the conjunction, as it is in a `Query`. */
const matches = (body: AnyQuery, row: Row, input: Row): boolean =>
  body.where.every(node => holds(node, { row, input, next: {} }) === true)

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
export const supported: ReadonlyArray<Operation> = [
  'eq',
  'isNull',
  'isNotNull',
  'contains',
  'in',
  'and',
  'or',
  'not',
  'compare',
]

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
