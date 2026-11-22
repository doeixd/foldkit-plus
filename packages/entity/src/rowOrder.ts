/**
 * How the reference interpreter sorts rows by an order's terms: each row's
 * keys worked out once (a term's call through metakit, as every judge runs
 * it), then compared term by term, text by code point under its collation.
 */
import { Option } from 'effect'
import { Collation } from './collation.js'
import type { ExprContext } from './context.js'
import { fieldRead, originTagged } from './expr/operand.js'
import type { OrderTerm } from './expr/order.js'
import { show } from './expr/show.js'
import { Held } from './held.js'
import { flatRow, preparedOf, noRow, run, type Row } from './judgeRun.js'
import { kernelOperators } from './memoryTable.js'
import type { MemoryOperators } from './operators.js'
import { QueryEvaluateError, RowsMissingError } from './queryErrors.js'
import { uncollatedText } from './uncollated.js'

const { foldAscii } = Collation

const isNull = (value: unknown): boolean => value === null || value === undefined

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

/** What an order's keys are worked out with: a call may read the input, and runs by the table. */
export interface OrderScope {
  readonly input: Row
  readonly operators: MemoryOperators
  readonly context?: ExprContext | undefined
}

/**
 * Each term's key for one row: a field's value, or what a call comes to over
 * the row. A key metakit refuses refuses the row; so does NaN, since one
 * row's NaN would make every comparison with it NaN, and the sort of every
 * other row with it.
 */
export const keysOf = (
  row: Row,
  terms: ReadonlyArray<OrderTerm>,
  scope: OrderScope,
): ReadonlyArray<unknown> =>
  run(
    preparedOf(
      terms,
      terms.map(term => term.expr),
    ),
    {
      row: flatRow(row),
      next: noRow,
      input: scope.input,
      operators: scope.operators,
      judging: false,
      context: scope.context,
    },
  ).map((held, index) => {
    const key = Held.match(held, {
      onHeld: value => value,
      onUnheld: reason => {
        throw new RowsMissingError(reason)
      },
    })
    if (typeof key === 'number' && Number.isNaN(key)) {
      throw new QueryEvaluateError(
        `an order by ${show(terms[index]!.expr)} was given NaN, which SQLite stores as null and Postgres orders after every number`,
      )
    }
    return key
  })

/**
 * Refuses a term this interpreter will not order by, before any key is worked
 * out: one over neither a field nor a call, or by a backend's locale collation.
 */
export const checkTerms = (terms: ReadonlyArray<OrderTerm>, query: string) =>
  terms.forEach(term => {
    const field = Option.exists(fieldRead(term.expr.node), read => read.slice === 'row')
    if (!field && Option.isNone(originTagged(term.expr.node, 'Call'))) {
      throw new QueryEvaluateError(
        `query "${query}" orders by something that is neither a field nor a call`,
      )
    }
    if (Option.exists(term.collation, declared => declared._tag === 'Locale')) {
      throw new QueryEvaluateError(
        `query "${query}" orders ${show(term.expr)} by a backend's locale collation, which only that backend has`,
      )
    }
  })

/**
 * Refuses an ordering this interpreter will not answer for, before sorting, so
 * the refusal names the first offending row in row order rather than whichever
 * pair the engine's sort happened to compare first: a key whose kind differs
 * from the first present one's. A null key is not refused; the term says
 * where it goes.
 */
export const checkKeys = (
  keys: ReadonlyArray<ReadonlyArray<unknown>>,
  terms: ReadonlyArray<OrderTerm>,
  query: string,
) =>
  terms.forEach((_, index) => {
    let first: string | undefined
    for (const row of keys) {
      const value = row[index]
      if (isNull(value)) continue
      const kind = typeof value
      first ??= kind
      if (kind !== first || !comparable.has(kind)) {
        throw new QueryEvaluateError(
          `query "${query}" orders by values this interpreter cannot compare (${first} and ${kind})`,
        )
      }
    }
  })

/**
 * Refuses an order over text with no declared collation: JavaScript would
 * answer by code point where SQLite compares bytes and Postgres follows its
 * locale. Asked wherever the answer depends on the order, and not of a
 * membership judged alone (`evaluateEach`), which no order decides.
 */
const checkCollated = (terms: ReadonlyArray<OrderTerm>, query: string) => {
  for (const term of terms) {
    const uncollated = uncollatedText(term)
    if (Option.isSome(uncollated)) {
      throw new QueryEvaluateError(`query "${query}" cannot be ordered: ${uncollated.value}`)
    }
  }
}

/** Two rows' keys by checked terms: negative when `left` sorts first. */
export const byTerms = (
  terms: ReadonlyArray<OrderTerm>,
  left: ReadonlyArray<unknown>,
  right: ReadonlyArray<unknown>,
): number => {
  for (const [index, term] of terms.entries()) {
    const absentLeft = isNull(left[index])
    const absentRight = isNull(right[index])
    // Where a row without a value goes is the term's to say, whichever the
    // direction; two such rows tie, for the next term.
    if (absentLeft || absentRight) {
      if (absentLeft && absentRight) continue
      return absentLeft === (term.nulls === 'first') ? -1 : 1
    }
    const sign = compare(left[index], right[index], term.collation)
    if (sign !== 0) return term.direction === 'asc' ? sign : -sign
  }
  return 0
}

/** `rows` in the order `terms` give, refusing what `compareRows` refuses. */
export const ordered = (
  rows: ReadonlyArray<Row>,
  terms: ReadonlyArray<OrderTerm>,
  query: string,
  scope: OrderScope,
) => {
  // Keys are worked out and checked however few the rows, so a term refused over
  // one row is refused as it is over many, as `evaluateEach` refuses it.
  if (terms.length === 0) return [...rows]
  checkCollated(terms, query)
  checkTerms(terms, query)
  // Each row's keys worked out once, not once per comparison: a call may be dear.
  const keyed = rows.map(row => ({ row, keys: keysOf(row, terms, scope) }))
  checkKeys(
    keyed.map(({ keys }) => keys),
    terms,
    query,
  )
  return keyed.sort((left, right) => byTerms(terms, left.keys, right.keys)).map(({ row }) => row)
}

/**
 * Where `left` sorts against `right` under these terms (`Query.orderFor`'s),
 * as `evaluate` sorts: negative when it comes first. A call among them runs
 * over each row with `input` and `operators` (the kernel's when not given).
 * Refuses what `evaluate` refuses, for these two rows: a term over neither a
 * field nor a call, a locale collation, text with no declared collation, keys
 * of different kinds, or an operator the table lacks. For a client placing
 * one row among others it holds.
 */
export const compareRows = (
  terms: ReadonlyArray<OrderTerm>,
  left: Row,
  right: Row,
  query: string,
  options: {
    readonly input?: Row | undefined
    readonly operators?: MemoryOperators | undefined
    readonly context?: ExprContext | undefined
  } = {},
): number => {
  const scope = {
    input: options.input ?? {},
    operators: options.operators ?? kernelOperators,
    context: options.context,
  }
  checkCollated(terms, query)
  checkTerms(terms, query)
  const keys = [keysOf(left, terms, scope), keysOf(right, terms, scope)] as const
  checkKeys(keys, terms, query)
  return byTerms(terms, keys[0], keys[1])
}
