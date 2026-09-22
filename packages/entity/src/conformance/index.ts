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
import { Schema, SchemaGetter } from 'effect'
import { Entity, Expr, Order, Query, type AnyQuery } from '../index.js'

/**
 * A `Date` on the way in, an ISO string on the wire — the one fixture whose
 * **encoded form differs from its decoded form**.
 *
 * Every other column here encodes to itself, which is why the suite could not
 * previously see an interpreter comparing a decoded value against an encoded
 * row. That is not a hypothetical bug: a store holds wire values and decodes at
 * read, while a `QueryRef`'s input and a body's literals are written in domain
 * terms, so anything that runs a body over stored rows has to reconcile the two
 * and nothing was checking that it did.
 */
const Timestamp = Schema.Date.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.transform((iso: string) => new Date(iso)),
    encode: SchemaGetter.transform((at: Date) => at.toISOString()),
  }),
)

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
    /** Encoded and decoded forms differ on purpose: see `Timestamp`. */
    at: Timestamp,
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
  /** The **encoded** form: what a store holds and an interpreter compares. */
  readonly at: string
  readonly [key: string]: unknown
}

export const rows: ReadonlyArray<ConformanceRow> = [
  { id: 'a', label: 'Intro', rank: 2, tag: null, at: '2026-01-01T00:00:00.000Z' },
  { id: 'b', label: 'intro to sql', rank: 1, tag: 'x', at: '2026-01-02T00:00:00.000Z' },
  { id: 'c', label: 'Other', rank: 3, tag: null, at: '2026-01-02T00:00:00.000Z' },
  { id: 'd', label: '100% cotton', rank: 3, tag: 'x', at: '2026-01-03T00:00:00.000Z' },
  { id: 'e', label: 'snake_case', rank: 4, tag: 'y', at: '2026-01-04T00:00:00.000Z' },
]

export interface ConformanceCase {
  /** What the case pins, as a sentence an interpreter fails by name. */
  readonly what: string
  readonly body: AnyQuery
  /**
   * The inputs, **encoded** — the space a store's rows are in, not the domain
   * space the body's types describe. For every column but `at` the two are the
   * same value, which is exactly why this has to be said rather than inferred
   * from the fixtures.
   */
  readonly input: Readonly<Record<string, unknown>>
  /** The ids the body matches, in the order it asks for. */
  readonly expected: ReadonlyArray<string>
}

const from = Query.from(Subject)
const byId = Query.orderBy(Order.asc(Subject.fields.id))
const label = Expr.input('label', Schema.String)
const tag = Expr.input('tag', Schema.String)
const present = Expr.input('present', Schema.Boolean)
const at = Expr.input('at', Timestamp)

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
  ...[true, false].map(value => ({
    what: `a ${value} input compared to a predicate works in reverse order`,
    body: from.pipe(Query.where(Expr.eq(present, Expr.isNotNull(Subject.fields.tag))), byId),
    input: { present: value },
    expected: value ? ['b', 'd', 'e'] : ['a', 'c'],
  })),
  ...[true, false].map(value => ({
    what: `an unknown equality compared to ${value} stays unknown`,
    body: from.pipe(Query.where(Expr.eq(Expr.eq(Subject.fields.tag, tag), present)), byId),
    input: { tag: null, present: value },
    expected: [],
  })),

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
  {
    what: 'contains with a null search is unknown for every row',
    body: from.pipe(Query.where(Expr.contains(Subject.fields.label, label)), byId),
    input: { label: null },
    expected: [],
  },
  {
    what: 'an unknown containment compared to false stays unknown',
    body: from.pipe(Query.where(Expr.eq(Expr.contains(Subject.fields.label, label), false)), byId),
    input: { label: null },
    expected: [],
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

  // ---- encoded values ------------------------------------------------------
  // The body's types say `Date`; a store's rows and a request's inputs are ISO
  // strings. An interpreter compares in the **encoded** space, and these are the
  // cases that say so — for every other column the two spaces hold the same
  // value, so nothing here could previously tell them apart.
  //
  // What happens when a caller passes a *decoded* value is deliberately not a
  // case, because the interpreters do not agree: the reference one matches
  // nothing, SQLite raises `datatype mismatch`, and a local engine does
  // whatever its own comparison does. `cases` are what interpreters must agree
  // about. The consequence is pinned in `packages/entity/test/encoding.test.ts`
  // instead, and it is the one that matters: **a runtime error cannot be relied
  // on to catch the mistake**, because one of the three answers is an empty
  // result that reads exactly like a correct one.
  {
    what: 'an input whose encoded form differs from its decoded one matches on the encoded one',
    body: from.pipe(Query.where(Expr.eq(Subject.fields.at, at)), byId),
    input: { at: '2026-01-02T00:00:00.000Z' },
    expected: ['b', 'c'],
  },
  {
    what: 'a literal is encoded too, or it has the same problem as an input',
    body: from.pipe(
      Query.where(Expr.eq(Subject.fields.at, '2026-01-03T00:00:00.000Z' as never)),
      byId,
    ),
    input: {},
    expected: ['d'],
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
  // Ordering by text is deliberately not here. How text compares is the
  // backend's — SQLite by code point, TanStack by locale, Postgres by whatever
  // the database was created with — and §6.0.1 puts it outside the conformant
  // subset rather than pretending one of them is the rule. A case asserting an
  // order would only pin whichever engine was written first.
]
