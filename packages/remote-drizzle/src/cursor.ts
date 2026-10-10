/**
 * Keyset (cursor) pagination over Drizzle.
 *
 * Adapted from fate's Drizzle integration (MIT, Copyright (c) 2025 Nakazawa
 * Tech); see `THIRD_PARTY_NOTICES.md`.
 *
 * The cursor is opaque and is the row's identity: the executor re-reads the
 * ordering columns for that row and builds the predicate from those values, so
 * the wire cursor stays a string regardless of the ordered column types.
 *
 * Where nulls go is said on every term, and the `ORDER BY` says it too
 * (`NULLS FIRST`/`NULLS LAST`): left unsaid, SQLite puts them first ascending
 * and Postgres last, so the keyset predicate, which has to know, would match
 * one of them only. The default is Postgres's (ASC: nulls last, DESC: nulls
 * first). A null cursor value pages by `IS NULL`, never `col > NULL`.
 */
import { and, eq, gt, isNotNull, isNull, lt, or, sql, type AnyColumn, type SQL } from 'drizzle-orm'

export interface OrderTerm {
  readonly column: AnyColumn
  readonly direction: 'asc' | 'desc'
  /** Where rows without a value go; last ascending and first descending when unsaid. */
  readonly nulls?: 'first' | 'last' | undefined
}

/** Whether a term puts rows without a value after every row with one, in its own direction. */
const nullsLast = (term: OrderTerm): boolean =>
  (term.nulls ?? (term.direction === 'asc' ? 'last' : 'first')) === 'last'

/**
 * The order a client asked for, as order terms. `sort` names one of the orders
 * the server offers, never a column: `columns` is the server's say in what each
 * name means. A name it does not offer, or no sort at all, is no terms, which a
 * query orders by id.
 */
export const sortTerms = (
  sort: { readonly by: string; readonly direction: 'asc' | 'desc' } | null | undefined,
  columns: Readonly<Record<string, AnyColumn>>,
): readonly OrderTerm[] => {
  if (sort === null || sort === undefined || !Object.hasOwn(columns, sort.by)) return []
  return [{ column: columns[sort.by]!, direction: sort.direction }]
}

export type Traversal = 'forward' | 'backward'

/** Equality that treats a null cursor value as `IS NULL`, not `= NULL`. */
const cursorEquality = (column: AnyColumn, value: unknown): SQL =>
  value === null ? isNull(column) : eq(column, value)

/**
 * Rows after (forward) or before (backward) the cursor on one column, nulls
 * where the term puts them. `false` means no row qualifies: nothing follows a
 * null cursor when nulls are last, and nothing precedes one when they are
 * first.
 */
const cursorCompare = (term: OrderTerm, value: unknown, traversal: Traversal): SQL => {
  const { column } = term
  const forward = traversal === 'forward'
  const last = nullsLast(term)
  // After the cursor, forward; before it, backward.
  if (value === null) return forward === last ? sql`false` : isNotNull(column)
  const beyond = (term.direction === 'asc') === forward ? gt(column, value) : lt(column, value)
  return forward === last ? or(beyond, isNull(column))! : beyond
}

/**
 * `(a CMP A) OR (a = A AND b CMP B) OR ...` — the lexicographic predicate that
 * keeps a page contiguous under a multi-column order. `forward` selects rows
 * after the cursor; `backward` before it.
 */
export function keysetWhere(
  terms: readonly [OrderTerm, ...OrderTerm[]],
  values: readonly unknown[],
  traversal: Traversal,
): SQL
export function keysetWhere(
  terms: readonly OrderTerm[],
  values: readonly unknown[],
  traversal: Traversal,
): SQL | undefined
export function keysetWhere(
  terms: readonly OrderTerm[],
  values: readonly unknown[],
  traversal: Traversal,
): SQL | undefined {
  if (terms.length === 0) return undefined
  const branches = terms.map((term, index) => {
    const equalities = terms
      .slice(0, index)
      .map((previous, previousIndex) => cursorEquality(previous.column, values[previousIndex]))
    const branch = cursorCompare(term, values[index], traversal)
    return equalities.length === 0 ? branch : and(...equalities, branch)!
  })
  return branches.length === 1 ? branches[0] : or(...branches)
}

/**
 * The `ORDER BY` for a traversal, nulls placed as the term says: backward
 * reverses each term, its nulls with it.
 */
export const orderByTerms = (
  terms: readonly OrderTerm[],
  traversal: Traversal,
): ReadonlyArray<SQL> =>
  terms.map(term => {
    const forward = traversal === 'forward'
    const ascending = (term.direction === 'asc') === forward
    const last = nullsLast(term) === forward
    return sql`${term.column} ${ascending ? sql`asc` : sql`desc`} ${last ? sql`nulls last` : sql`nulls first`}`
  })

/** The tuple columns to re-read for a cursor, keyed as Drizzle select aliases. */
export const cursorSelection = (terms: readonly OrderTerm[]): Record<string, AnyColumn> =>
  Object.fromEntries(terms.map(term => [term.column.name, term.column]))
