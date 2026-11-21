/**
 * Cases for the node kinds and operator sorts no conformance case reaches
 * (`Next`, `Now`, a bare `Viewer`, a link read as a value, primitive operators
 * of each null and collation rule, a defined call giving text); the cases the
 * kernel note says change meaning; and the probes of disagreements it does not
 * cover. `lowerKinds.test.ts` runs each through both judges.
 */
import { Option, Schema } from 'effect'
import {
  Collation,
  Entity,
  Expr,
  Held,
  Operators,
  type AnyEntity,
  type ExprContext,
  type HeldTable,
  type Predicate,
} from '../src/index.js'
import { Relational, relationalTables } from '../src/conformance/index.js'
import { idOf, type Answer, type Over } from './lowerHarness.js'

export const Item = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    name: Schema.NullOr(Schema.String),
    qty: Schema.Number,
    score: Schema.NullOr(Schema.Number),
  }),
)
const items = [
  { id: 'i1', name: 'Alpha', qty: 2, score: null },
  { id: 'i2', name: 'beta', qty: 5, score: 3 },
  { id: 'i3', name: null, qty: 0, score: 1 },
]
const NUL = String.fromCharCode(0)

const double = Expr.operator('lower.double', {
  input: [Schema.NullOr(Schema.Number)],
  output: Schema.Number,
})
const orZero = Expr.operator('lower.orZero', {
  input: [Schema.NullOr(Schema.Number)],
  output: Schema.Number,
  nulls: 'handled',
})
const same = Expr.operator('lower.same', {
  input: [Schema.NullOr(Schema.String), Schema.NullOr(Schema.String)],
  output: Schema.Boolean,
  collation: 'required',
})
const collated = Expr.operator('lower.collated', {
  input: [Schema.NullOr(Schema.String)],
  output: Schema.Boolean,
  collation: 'required',
})
const itself = Expr.operator('lower.itself', {
  input: [Schema.NullOr(Schema.String)],
  output: Schema.NullOr(Schema.String),
  definedAs: text => text,
})

/** A primitive operator no table here implements. */
export const serverOnly = Expr.operator('lower.serverOnly', {
  input: [Schema.NullOr(Schema.String)],
  output: Schema.Boolean,
})

export const operators = Operators.merge(
  Operators.kernel,
  Operators.memory(
    Operators.implement(double, value => value * 2),
    Operators.implementHandlingNulls(orZero, value => value ?? 0),
    Operators.implement(same, (left, right, { collation }) =>
      Option.exists(collation, each => each._tag === 'AsciiFold')
        ? Collation.foldAscii(left) === Collation.foldAscii(right)
        : left === right,
    ),
    // Reads the collation it is told, which a foreign operation is not.
    Operators.implement(collated, (_, { collation }) => Option.isSome(collation)),
  ),
)

export interface KindCase {
  readonly what: string
  readonly predicate: Predicate
  readonly entity?: AnyEntity | undefined
  readonly tables?: ReadonlyArray<HeldTable> | undefined
  readonly next?: ReadonlyArray<Readonly<Record<string, unknown>>> | undefined
  readonly input?: Readonly<Record<string, unknown>> | undefined
  readonly context?: ExprContext | undefined
  /** Today's judge's answer, by row id, so agreeing is not all the test asks. */
  readonly answers: Readonly<Record<string, Answer>>
}

const now = (at: number): ExprContext => ({ viewer: Option.none(), now: Option.some(at) })
const asking = (entity: string, id: string): ExprContext => ({
  viewer: Option.some({ entity, id }),
  now: Option.none(),
})
const { Badge: B, Member: M, Team: Tm } = Relational
const relational = relationalTables.map(table => ({ entity: table.entity, rows: table.visible }))
const atBadges = { entity: B, tables: relational }
const linkIsViewer = Expr.eq(B.relations.member, Expr.viewer(M))
const search = Expr.input('search', Schema.NullOr(Schema.String))

export const kindCases: ReadonlyArray<KindCase> = [
  {
    what: 'next: a field of the row a write leaves',
    predicate: Expr.gt(Expr.next(Item.fields.qty), Expr.field(Item.fields.qty)),
    next: items.map(row => ({ ...row, qty: row.id === 'i1' ? 3 : row.qty })),
    answers: { i1: 'true', i2: 'false', i3: 'false' },
  },
  {
    what: 'now: the time of the write',
    predicate: Expr.lt(Item.fields.qty, Expr.now),
    context: now(3),
    answers: { i1: 'true', i2: 'false', i3: 'true' },
  },
  {
    what: 'a link read as a value, against the viewer',
    predicate: linkIsViewer,
    ...atBadges,
    context: asking('Member', 'm1'),
    answers: { b1: 'true', b2: 'true', b3: 'false', b5: 'false' },
  },
  {
    what: 'the viewer of another Entity is null',
    predicate: linkIsViewer,
    ...atBadges,
    context: asking('Team', 't1'),
    answers: { b1: 'null', b2: 'null', b3: 'null', b5: 'null' },
  },
  {
    what: 'a visitor is null',
    predicate: linkIsViewer,
    ...atBadges,
    context: { viewer: Option.none(), now: Option.none() },
    answers: { b1: 'null', b2: 'null', b3: 'null', b5: 'null' },
  },
  {
    what: 'a strict primitive operator: a null argument gives null',
    predicate: Expr.eq(double(Item.fields.score), 6),
    answers: { i1: 'null', i2: 'true', i3: 'false' },
  },
  {
    what: 'a primitive operator that handles null is given it',
    predicate: Expr.eq(orZero(Item.fields.score), 0),
    answers: { i1: 'true', i2: 'false', i3: 'false' },
  },
  {
    what: 'a primitive operator comparing text under asciiFold',
    predicate: same(Item.fields.name, 'alpha', { collation: Collation.asciiFold }),
    answers: { i1: 'true', i2: 'false', i3: 'null' },
  },
  {
    what: 'a primitive operator comparing text under binary',
    predicate: same(Item.fields.name, 'Alpha', { collation: Collation.binary }),
    answers: { i1: 'true', i2: 'false', i3: 'null' },
  },
  {
    what: 'a defined call giving text compares under the collation given',
    predicate: Expr.lt(itself(Item.fields.name), 'b', { collation: Collation.asciiFold }),
    answers: { i1: 'true', i2: 'false', i3: 'null' },
  },
  {
    what: 'a path from the viewer to their own id reads null where their row is hidden',
    predicate: Expr.isNull(Expr.path(Expr.viewer(Tm), Tm.fields.id)),
    ...atBadges,
    context: asking('Team', 't3'),
    answers: { b1: 'true', b2: 'true', b3: 'true', b5: 'true' },
  },
  {
    what: 'the viewer whose row is hidden is still who asks',
    predicate: Expr.isNull(Expr.viewer(Tm)),
    ...atBadges,
    context: asking('Team', 't3'),
    answers: { b1: 'false', b2: 'false', b3: 'false', b5: 'false' },
  },
  // ---- what the note says changes ----------------------------------------------
  {
    what: 'add past the safe integer range',
    predicate: Expr.gt(Expr.add(Item.fields.qty, Expr.input('big', Schema.Number)), 0),
    input: { big: Number.MAX_SAFE_INTEGER },
    answers: { i1: 'true', i2: 'true', i3: 'true' },
  },
  {
    what: 'an implementation reading the collation it is told',
    predicate: collated(Item.fields.name, { collation: Collation.binary }),
    answers: { i1: 'true', i2: 'true', i3: 'null' },
  },
  // ---- what metakit's decisions of 2026-11-21 settle ---------------------------
  {
    what: 'or beside a contains given text holding NUL',
    predicate: Expr.or(Expr.eq(Item.fields.qty, 2), Expr.contains(Item.fields.name, search)),
    input: { search: `a${NUL}` },
    answers: { i1: 'refused', i2: 'refused', i3: 'refused' },
  },
  {
    what: 'eq given text holding NUL beside a null field',
    predicate: Expr.eq(Item.fields.name, search),
    input: { search: `a${NUL}` },
    answers: { i1: 'refused', i2: 'refused', i3: 'refused' },
  },
  {
    what: 'contains of stored text holding NUL, given a null search',
    predicate: Expr.contains(Item.fields.name, search),
    tables: [{ entity: Item, rows: [{ id: 'n1', name: `x${NUL}y`, qty: 1, score: null }] }],
    input: { search: null },
    answers: { n1: 'null' },
  },
]

/** What a case is judged over, row by row. */
export const judgedRows = (c: Omit<KindCase, 'what' | 'answers'>): ReadonlyArray<Over> => {
  const entity = c.entity ?? Item
  const holder = Held.rows(c.tables ?? [{ entity: Item, rows: items }])
  const after = Held.rows([{ entity: Item, rows: c.next ?? [] }])
  return holder.rows(entity).map(row => ({
    entity,
    row,
    next: c.next === undefined ? undefined : Option.getOrUndefined(after.row(Item, idOf(row))),
    input: c.input ?? {},
    context: c.context,
    rows: holder,
    operators,
  }))
}
