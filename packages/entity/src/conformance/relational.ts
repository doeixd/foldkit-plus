/**
 * The conformance suite for paths and exists: bodies that read other rows,
 * over a domain whose reader may not see every row.
 *
 * Two laws are checked against these cases. An interpreter that runs over
 * every row the reader may see (SQL, under each table's visibility rule)
 * answers `expected`. An interpreter that runs over what a holder has
 * (`Judge`, over each of `heldWorlds`) answers unknown or what `expected`
 * says, never the other answer, and over everything the reader may see it
 * answers every row.
 *
 * The fixture is chosen so a path meets each way of reaching no row (a null
 * link, a row the reader may not see), a field that is null on the row
 * reached, and an exists whose only witness is hidden.
 */
import { Schema } from 'effect'
import { Collation, Entity, Expr, Order, Query, Relation } from '../index.js'
import type { AnyEntity, AnyQuery, HeldTable } from '../index.js'

const Team = Entity.define(
  'Team',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    /** Null on purpose: a path reaching a row whose field is null. */
    region: Schema.NullOr(Schema.String),
  }),
)
const Member = Entity.define(
  'Member',
  Schema.Struct({ id: Schema.String, handle: Schema.String, rank: Schema.Number }),
)
const Badge = Entity.define('Badge', Schema.Struct({ id: Schema.String, kind: Schema.String }))
const Pin = Entity.define('Pin', Schema.Struct({ id: Schema.String, label: Schema.String }))

/**
 * A member is on a team or none; a badge is a member's; a pin is a team's.
 * Stored as foreign keys named after each relation plus `_id`.
 */
export const Relational = Entity.relate(
  { Team, Member, Badge, Pin },
  {
    Member: { team: Relation.one(Team, { optional: true }) },
    Badge: { member: Relation.one(Member) },
    Pin: { team: Relation.one(Team) },
  },
)

/** A row as the suite writes one: fields, and each `one` relation as the id it points at. */
export type RelationalRow = Readonly<Record<string, string | number | null>>

/** One Entity's rows: those the reader may see, and those its visibility rule hides. */
export interface RelationalTable {
  readonly entity: AnyEntity
  readonly visible: ReadonlyArray<RelationalRow>
  /**
   * Rows the reader may not see. SQL's rule hides a Team named `Hidden` and a
   * Badge of kind `secret`; a holder never has them.
   */
  readonly hidden: ReadonlyArray<RelationalRow>
}

export const relationalTables: ReadonlyArray<RelationalTable> = [
  {
    entity: Relational.Team,
    visible: [
      { id: 't1', name: 'Red', region: 'eu' },
      { id: 't2', name: 'Blue', region: null },
    ],
    hidden: [{ id: 't3', name: 'Hidden', region: 'eu' }],
  },
  {
    entity: Relational.Member,
    visible: [
      { id: 'm1', handle: 'ann', rank: 1, team: 't1' },
      { id: 'm2', handle: 'bob', rank: 2, team: 't2' },
      { id: 'm3', handle: 'cy', rank: 3, team: null },
      // On a team the reader may not see.
      { id: 'm4', handle: 'dee', rank: 4, team: 't3' },
      { id: 'm5', handle: 'Eve', rank: 5, team: 't1' },
    ],
    hidden: [],
  },
  {
    entity: Relational.Badge,
    visible: [
      { id: 'b1', kind: 'gold', member: 'm1' },
      { id: 'b2', kind: 'silver', member: 'm1' },
      { id: 'b3', kind: 'gold', member: 'm2' },
      { id: 'b5', kind: 'silver', member: 'm4' },
    ],
    // m3's only badge.
    hidden: [{ id: 'b4', kind: 'secret', member: 'm3' }],
  },
  {
    entity: Relational.Pin,
    visible: [
      { id: 'p1', label: 'top', team: 't1' },
      { id: 'p2', label: 'low', team: 't2' },
      { id: 'p3', label: 'top', team: 't3' },
    ],
    hidden: [],
  },
]

export interface RelationalCase {
  readonly what: string
  readonly body: AnyQuery
  /** Encoded, as `ConformanceCase.input`. */
  readonly input: Readonly<Record<string, unknown>>
  /** The ids of the visible rows the body matches, by id. */
  readonly expected: ReadonlyArray<string>
}

const { Team: T, Member: M, Badge: B, Pin: P } = Relational
const members = Query.from(M).pipe(Query.orderBy(Order.asc(M.fields.id)))
const badges = Query.from(B).pipe(Query.orderBy(Order.asc(B.fields.id)))
const teams = Query.from(T).pipe(Query.orderBy(Order.asc(T.fields.id)))
const teamName = Expr.path(M.relations.team, T.fields.name)
const topPin = Expr.path(
  M.relations.team,
  Expr.exists(P.relations.team, Expr.eq(P.fields.label, 'top')),
)
const gold = Expr.exists(B.relations.member, Expr.eq(B.fields.kind, 'gold'))

export const relationalCases: ReadonlyArray<RelationalCase> = [
  // ---- a path's field ---------------------------------------------------------
  {
    what: 'a path reads a field of the row its relation points at',
    body: members.pipe(Query.where(Expr.eq(teamName, 'Red'))),
    input: {},
    expected: ['m1', 'm5'],
  },
  {
    what: 'a path reads null through a null link, and through a row the reader may not see',
    body: members.pipe(Query.where(Expr.isNull(teamName))),
    input: {},
    expected: ['m3', 'm4'],
  },
  {
    what: "a path's null is unknown under not, so neither side keeps the row",
    body: members.pipe(Query.where(Expr.not(Expr.eq(teamName, 'Red')))),
    input: {},
    expected: ['m2'],
  },
  {
    what: 'a path reads a null field of the row reached as null',
    body: members.pipe(Query.where(Expr.isNull(Expr.path(M.relations.team, T.fields.region)))),
    input: {},
    expected: ['m2', 'm3', 'm4'],
  },
  {
    what: 'a path compares with an input',
    body: members.pipe(
      Query.where(
        Expr.eq(Expr.path(M.relations.team, T.fields.region), Expr.input('region', Schema.String)),
      ),
    ),
    input: { region: 'eu' },
    expected: ['m1', 'm5'],
  },
  {
    what: "contains folds a path's text as it folds a field's",
    body: members.pipe(Query.where(Expr.contains(teamName, 'E'))),
    input: {},
    expected: ['m1', 'm2', 'm5'],
  },
  {
    what: "a comparison orders a path's text under the collation it names",
    body: members.pipe(Query.where(Expr.lt(teamName, 'C', { collation: Collation.binary }))),
    input: {},
    expected: ['m2'],
  },
  {
    what: 'a path follows two relations',
    body: badges.pipe(
      Query.where(
        Expr.eq(Expr.path(B.relations.member, Expr.path(M.relations.team, T.fields.name)), 'Red'),
      ),
    ),
    input: {},
    expected: ['b1', 'b2'],
  },
  {
    what: 'a path of two relations reads null where either reaches no row or the field is null',
    body: badges.pipe(
      Query.where(
        Expr.isNull(Expr.path(B.relations.member, Expr.path(M.relations.team, T.fields.region))),
      ),
    ),
    input: {},
    expected: ['b3', 'b5'],
  },
  {
    what: "in tests a path's value against a list",
    body: badges.pipe(Query.where(Expr.in(Expr.path(B.relations.member, M.fields.rank), [1, 4]))),
    input: {},
    expected: ['b1', 'b2', 'b5'],
  },

  // ---- exists -----------------------------------------------------------------
  {
    what: 'exists finds a row pointing here, and never one the reader may not see',
    body: members.pipe(Query.where(Expr.exists(B.relations.member))),
    input: {},
    expected: ['m1', 'm2', 'm4'],
  },
  {
    what: 'exists holds when a pointing row holds its filter',
    body: members.pipe(Query.where(gold)),
    input: {},
    expected: ['m1', 'm2'],
  },
  {
    what: 'exists is never unknown, so its not keeps every other row',
    body: members.pipe(Query.where(Expr.not(gold))),
    input: {},
    expected: ['m3', 'm4', 'm5'],
  },
  {
    what: "an exists' filter reads the input",
    body: members.pipe(
      Query.where(
        Expr.exists(B.relations.member, Expr.eq(B.fields.kind, Expr.input('kind', Schema.String))),
      ),
    ),
    input: { kind: 'silver' },
    expected: ['m1', 'm4'],
  },
  {
    what: "or holds by either side, an exists or the row's own field",
    body: members.pipe(Query.where(Expr.or(Expr.eq(M.fields.rank, 5), gold))),
    input: {},
    expected: ['m1', 'm2', 'm5'],
  },
  {
    what: 'and joins a path and the negation of an exists',
    body: members.pipe(
      Query.where(Expr.and(Expr.isNotNull(teamName), Expr.not(Expr.exists(B.relations.member)))),
    ),
    input: {},
    expected: ['m5'],
  },
  {
    what: "an exists' filter folds text as contains does",
    body: teams.pipe(
      Query.where(Expr.exists(M.relations.team, Expr.contains(M.fields.handle, 'E'))),
    ),
    input: {},
    expected: ['t1'],
  },
  {
    what: 'not of an exists holds where no pointing row holds the filter',
    body: teams.pipe(
      Query.where(Expr.not(Expr.exists(M.relations.team, Expr.gte(M.fields.rank, 5)))),
    ),
    input: {},
    expected: ['t2'],
  },

  // ---- an exists at the end of a path ----------------------------------------
  {
    what: 'an exists asked of the row a path reaches',
    body: members.pipe(Query.where(topPin)),
    input: {},
    expected: ['m1', 'm5'],
  },
  {
    what: 'an exists through a path that reaches no row is unknown, so its not keeps neither',
    body: members.pipe(Query.where(Expr.not(topPin))),
    input: {},
    expected: ['m2'],
  },
]

/** The tables a holder has, from what the reader may see of each, and which rows it judges. */
export interface HeldWorld {
  readonly what: string
  readonly tables: ReadonlyArray<HeldTable>
}

const held = (
  change: (table: RelationalTable) => Partial<Omit<HeldTable, 'entity'>>,
): ReadonlyArray<HeldTable> =>
  relationalTables.map(table => ({ entity: table.entity, rows: table.visible, ...change(table) }))

const named = (table: RelationalTable, entity: AnyEntity): boolean =>
  table.entity.identity.token === entity.identity.token

/** A record without the keys named. */
const without = (row: RelationalRow, keys: ReadonlyArray<string>): RelationalRow =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)))

/**
 * What a holder might have, first everything the reader may see. Each later
 * one lacks something a case reads, so some judgement in it is unknown.
 */
export const heldWorlds: ReadonlyArray<HeldWorld> = [
  { what: 'everything the reader may see', tables: held(() => ({})) },
  {
    what: 'no team',
    tables: held(table => (named(table, T) ? { rows: [], complete: false } : {})),
  },
  {
    what: 'every other row of each table',
    tables: held(table => ({
      rows: table.visible.filter((_, index) => index % 2 === 0),
      complete: false,
    })),
  },
  {
    what: "a team's name and region hidden",
    tables: held(table => (named(table, T) ? { hidden: ['name', 'region'] } : {})),
  },
  {
    what: 'no badge, and not every pin',
    tables: held(table =>
      named(table, B)
        ? { rows: [], complete: false }
        : named(table, P)
          ? { rows: table.visible.slice(1), complete: false }
          : {},
    ),
  },
  {
    what: 'no link held',
    tables: held(table => ({
      rows: table.visible.map(row => without(row, ['team', 'member'])),
    })),
  },
]
