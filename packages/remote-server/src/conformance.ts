/**
 * The conformance suite for a query body: what
 * [data-query-DESIGN §6.0.1](../../../docs/design/data-query-DESIGN.md) says
 * each operator means, as cases an interpreter can be run against.
 *
 * Exported rather than kept in this repository's tests, because the interpreter
 * most worth checking against it is one written elsewhere: run every case
 * through yours and compare the ids, in order, against `expected`.
 *
 * §18 names portable-kernel conformance as what the reference interpreter is
 * for. This is that, extracted: one set of cases, run against every interpreter
 * rather than each interpreter having its own tests that happen to agree.
 * `foldkit-remote-server` runs them over rows in memory;
 * `foldkit-remote-drizzle` compiles them to SQL and runs them against a real
 * SQLite. A body that means two things fails in whichever is wrong.
 *
 * The cases are chosen to make interpreters *disagree*, which is the only kind
 * that tests anything. A fixture whose values are all lowercase cannot tell a
 * case-sensitive `contains` from a case-insensitive one — that is not a
 * hypothetical, it is how `contains` reached a released package meaning three
 * different things.
 */
import { Schema } from 'effect'
import { Entity, Expr, Order, Query, type AnyQuery } from 'foldkit-entity'

/** The one Entity every case reads, with a column of each kind that matters. */
export const Subject = Entity.define(
  'Subject',
  Schema.Struct({
    id: Schema.String,
    /** Mixed case on purpose: a case-blind `contains` must be caught. */
    label: Schema.String,
    rank: Schema.Number,
    /** Nullable on purpose: three-valued logic has to be exercised. */
    tag: Schema.String,
  }),
)

/**
 * How a row looks to an interpreter reading values, and to SQL as a table. The
 * index signature is what lets one be read by key without a cast, which is how
 * an interpreter over plain rows reads one.
 */
export interface ConformanceRow {
  readonly id: string
  readonly label: string
  readonly rank: number
  readonly tag: string | null
  readonly [key: string]: unknown
}

export const rows: ReadonlyArray<ConformanceRow> = [
  { id: 'a', label: 'Intro', rank: 2, tag: null },
  { id: 'b', label: 'intro to sql', rank: 1, tag: 'x' },
  { id: 'c', label: 'Other', rank: 3, tag: null },
  { id: 'd', label: '100% cotton', rank: 3, tag: 'x' },
  { id: 'e', label: 'snake_case', rank: 4, tag: 'y' },
]

export interface ConformanceCase {
  /** What the case pins, as a sentence an interpreter fails by name. */
  readonly what: string
  readonly body: AnyQuery
  readonly input: Readonly<Record<string, unknown>>
  /** The ids the body matches, in the order it asks for. */
  readonly expected: ReadonlyArray<string>
}

const from = Query.from(Subject)
const byId = Query.orderBy(Order.asc(Subject.fields.id))
const label = Expr.input('label', Schema.String)
const tag = Expr.input('tag', Schema.String)
const present = Expr.input('present', Schema.Boolean)

export const cases: ReadonlyArray<ConformanceCase> = [
  // ---- eq ------------------------------------------------------------------
  {
    what: 'eq matches a field against a literal',
    body: from.pipe(Query.where(Expr.eq(Subject.fields.rank, 3)), byId),
    input: {},
    expected: ['c', 'd'],
  },
  {
    what: 'eq matches a field against the value the request supplies',
    body: from.pipe(Query.where(Expr.eq(Subject.fields.label, label)), byId),
    input: { label: 'Other' },
    expected: ['c'],
  },
  {
    what: 'eq is exact: a value that differs only by case does not match',
    body: from.pipe(Query.where(Expr.eq(Subject.fields.label, label)), byId),
    input: { label: 'other' },
    expected: [],
  },
  {
    what: 'eq against null matches nothing, not even the rows that are null',
    body: from.pipe(Query.where(Expr.eq(Subject.fields.tag, tag)), byId),
    input: { tag: null },
    expected: [],
  },
  {
    what: 'eq against a value skips the rows whose column is null',
    body: from.pipe(Query.where(Expr.eq(Subject.fields.tag, 'x')), byId),
    input: {},
    expected: ['b', 'd'],
  },

  // ---- isNull / isNotNull --------------------------------------------------
  {
    what: 'isNull finds exactly the rows with no value',
    body: from.pipe(Query.where(Expr.isNull(Subject.fields.tag)), byId),
    input: {},
    expected: ['a', 'c'],
  },
  {
    what: 'isNotNull finds exactly the rest',
    body: from.pipe(Query.where(Expr.isNotNull(Subject.fields.tag)), byId),
    input: {},
    expected: ['b', 'd', 'e'],
  },
  {
    what: 'a predicate compared to a true input is that predicate',
    body: from.pipe(Query.where(Expr.eq(Expr.isNotNull(Subject.fields.tag), present)), byId),
    input: { present: true },
    expected: ['b', 'd', 'e'],
  },
  {
    what: 'a predicate compared to a false input is its negation',
    body: from.pipe(Query.where(Expr.eq(Expr.isNotNull(Subject.fields.tag), present)), byId),
    input: { present: false },
    expected: ['a', 'c'],
  },

  // ---- contains ------------------------------------------------------------
  {
    what: 'contains ignores case, which is stated rather than left to the backend',
    body: from.pipe(Query.where(Expr.contains(Subject.fields.label, label)), byId),
    input: { label: 'INTRO' },
    expected: ['a', 'b'],
  },
  {
    what: 'contains matches anywhere in the value, not only at the start',
    body: from.pipe(Query.where(Expr.contains(Subject.fields.label, label)), byId),
    input: { label: 'to sql' },
    expected: ['b'],
  },
  {
    what: 'containing the empty string is everything',
    body: from.pipe(Query.where(Expr.contains(Subject.fields.label, label)), byId),
    input: { label: '' },
    expected: ['a', 'b', 'c', 'd', 'e'],
  },
  {
    what: 'a percent is searched for literally, not as a wildcard',
    body: from.pipe(Query.where(Expr.contains(Subject.fields.label, label)), byId),
    input: { label: '%' },
    expected: ['d'],
  },
  {
    what: 'an underscore is searched for literally, not as a single-character wildcard',
    body: from.pipe(Query.where(Expr.contains(Subject.fields.label, label)), byId),
    input: { label: '_' },
    expected: ['e'],
  },
  {
    what: 'contains over a null column drops those rows, so it is not the same as no filter',
    body: from.pipe(Query.where(Expr.contains(Subject.fields.tag, label)), byId),
    input: { label: '' },
    expected: ['b', 'd', 'e'],
  },

  // ---- conjunction, which is the list rather than an operator ---------------
  {
    what: 'two predicates conjoin: every one must hold',
    body: from.pipe(
      Query.where(Expr.eq(Subject.fields.rank, 3), Expr.isNotNull(Subject.fields.tag)),
      byId,
    ),
    input: {},
    expected: ['d'],
  },
  {
    what: 'no predicate at all is every row',
    body: from.pipe(byId),
    input: {},
    expected: ['a', 'b', 'c', 'd', 'e'],
  },

  // ---- ordering ------------------------------------------------------------
  {
    what: 'orders ascending by a number',
    body: from.pipe(Query.orderBy(Order.asc(Subject.fields.rank), Order.asc(Subject.fields.id))),
    input: {},
    expected: ['b', 'a', 'c', 'd', 'e'],
  },
  {
    what: 'orders descending, and a later term breaks the tie',
    body: from.pipe(Query.orderBy(Order.desc(Subject.fields.rank), Order.asc(Subject.fields.id))),
    input: {},
    expected: ['e', 'c', 'd', 'a', 'b'],
  },
  {
    what: 'orders by text, which is by code point and so is case-sensitive',
    body: from.pipe(Query.orderBy(Order.asc(Subject.fields.label), Order.asc(Subject.fields.id))),
    input: {},
    expected: ['d', 'a', 'c', 'b', 'e'],
  },
]
