/**
 * Ordering by a call: the term's checks where it is written, the reference
 * interpreter's order, and placement by the client's table.
 * expr-operations-DESIGN §8.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Collation,
  Entity,
  Expr,
  Operators,
  Order,
  Query,
  compareRows,
  type AnyQuery,
  evaluate,
} from '../src/index.js'

const Part = Entity.define(
  'Part',
  Schema.Struct({
    id: Schema.String,
    rank: Schema.NullOr(Schema.Int),
    name: Schema.String,
    plain: Schema.String,
  }),
).pipe(Entity.annotateMembers({ name: Collation.of(Collation.asciiFold) }))
const { fields } = Part

/** How far a rank lies from a target: an order the input decides. */
const distance = Expr.operator('acme.distance', {
  input: [Schema.NullOr(Schema.Int), Schema.Int],
  output: Schema.NullOr(Schema.Int),
})
/** Text after text, under the collation its operands share. */
const joined = Expr.operator('acme.joined', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
})
/** Whether a rank is past a floor: a predicate, which is an answer, not an order. */
const past = Expr.operator('acme.past', {
  input: [Schema.NullOr(Schema.Int), Schema.Int],
  output: Schema.Boolean,
})
/** A rank and its double: neither a number nor text, so it orders nowhere alike. */
const pair = Expr.operator('acme.pair', {
  input: [Schema.NullOr(Schema.Int)],
  output: Schema.Array(Schema.Int),
})
/** A distance from zero, defined by the primitive one. */
const size = Expr.operator('acme.size', {
  input: [Schema.NullOr(Schema.Int)],
  output: Schema.NullOr(Schema.Int),
  definedAs: rank => distance(rank, 0),
})

const operators = Operators.merge(
  Operators.kernel,
  Operators.memory(
    Operators.implement(distance, (rank, target) => Math.abs(rank - target)),
    Operators.implement(joined, (left, right) => `${left}${right}`),
  ),
)

const target = Expr.input('target', Schema.Int)
/** Built when asked, so a test of the term's checks fails as a test, not as the file. */
const nearest = () => Query.from(Part).pipe(Query.orderBy(Order.asc(distance(fields.rank, target))))
const rows = [
  { id: 'p1', rank: 9, name: 'b', plain: 'x' },
  { id: 'p2', rank: 4, name: 'B', plain: 'x' },
  { id: 'p3', rank: null, name: 'a', plain: 'x' },
  { id: 'p4', rank: 6, name: 'C', plain: 'x' },
]
const ids = (body: AnyQuery, input: Record<string, unknown>) =>
  evaluate(body, input, rows, { operators }).map(row => row.id)

describe('An order term over a call', () => {
  it('orders by what the call comes to for each row and input, ties by id, nulls where said', () => {
    // From 5: p2 and p4 are 1 away, p1 4 away; p3 has no rank, so no distance, and goes last.
    expect(ids(nearest(), { target: 5 })).toEqual(['p2', 'p4', 'p1', 'p3'])
    expect(ids(nearest(), { target: 9 })).toEqual(['p1', 'p4', 'p2', 'p3'])
    const farthest = Query.from(Part).pipe(
      Query.orderBy(Order.desc(distance(fields.rank, target), { nulls: 'last' })),
    )
    expect(ids(farthest, { target: 5 })).toEqual(['p1', 'p2', 'p4', 'p3'])
  })

  it('orders text under the collation the call carries', () => {
    // `name` folds ASCII case, so its joined text does too: a, b and B tie, then C.
    const byName = Query.from(Part).pipe(Query.orderBy(Order.asc(joined(fields.name, '!'))))
    expect(ids(byName, {})).toEqual(['p3', 'p1', 'p2', 'p4'])
  })

  it('orders by what a defined operator means', () => {
    const bySize = Query.from(Part).pipe(Query.orderBy(Order.asc(size(fields.rank))))
    expect(ids(bySize, {})).toEqual(['p2', 'p4', 'p1', 'p3'])
  })

  it('refuses, where it is written, a call that orders nowhere alike', () => {
    expect(() => Order.asc(joined(fields.plain, '!'))).toThrow(/is text with no collation/)
    expect(() => Order.asc(past(fields.rank, 1))).toThrow(/a predicate is already an answer/)
    expect(() => Order.asc(pair(fields.rank))).toThrow(/is neither a number nor text/)
    expect(() =>
      Order.asc(joined(fields.name, '!'), { collation: Collation.locale('en_US') }),
    ).toThrow(/"en_US" collation, which a call cannot carry/)
    // The term's own collation is enough.
    expect(Order.asc(joined(fields.plain, '!'), { collation: Collation.binary }).collation).toEqual(
      Option.some(Collation.binary),
    )
  })

  it('refuses, where it is written, a chosen alternative that orders nowhere alike', () => {
    const sort = Expr.input(
      'sort',
      Schema.NullOr(
        Schema.Struct({
          by: Schema.Literals(['near', 'name']),
          direction: Schema.Literals(['asc', 'desc']),
        }),
      ),
    )
    expect(() =>
      Order.chosen(sort, { near: distance(fields.rank, target), name: joined(fields.plain, '!') }),
    ).toThrow(/is text with no collation/)
    const chosen = Query.from(Part).pipe(
      Query.orderBy(Order.chosen(sort, { near: distance(fields.rank, target), name: fields.name })),
    )
    expect(ids(chosen, { target: 5, sort: { by: 'near', direction: 'asc' } })).toEqual([
      'p2',
      'p4',
      'p1',
      'p3',
    ])
  })

  it('compares two rows as evaluate orders them, by the input and table given', () => {
    const terms = Query.orderFor(nearest(), { target: 5 })
    const [p1, p2] = rows
    expect(
      compareRows(terms, p2!, p1!, 'Nearest', { input: { target: 5 }, operators }),
    ).toBeLessThan(0)
    expect(
      compareRows(terms, p2!, p1!, 'Nearest', { input: { target: 9 }, operators }),
    ).toBeGreaterThan(0)
    expect(() => compareRows(terms, p2!, p1!, 'Nearest', { input: { target: 5 } })).toThrow(
      /does not run the operator "acme.distance"/,
    )
  })
})

describe('Placing by a call', () => {
  it('is placeable by a client whose table runs every primitive operator in it', () => {
    expect(Query.placement(nearest(), { target: 5 }, { operators })).toEqual({ _tag: 'Placeable' })
    const bySize = Query.from(Part).pipe(Query.orderBy(Order.asc(size(fields.rank))))
    expect(Query.placement(bySize, {}, { operators })).toEqual({ _tag: 'Placeable' })
  })

  it('is not, naming the operator, where the table lacks one, inside a defined operator too', () => {
    const bySize = Query.from(Part).pipe(Query.orderBy(Order.asc(size(fields.rank))))
    for (const body of [nearest(), bySize]) {
      const placed = Query.placement(body, { target: 5 }, { operators: Operators.kernel })
      expect(placed).toMatchObject({ _tag: 'NotPlaceable' })
      expect(placed._tag === 'NotPlaceable' && placed.reason).toMatch(
        /this client does not run acme.distance$/,
      )
    }
  })
})

describe('Expanding a primitive call', () => {
  it('expands a defined operator among its arguments', () => {
    const outer = distance(size(fields.rank), 1)
    const expanded = Expr.expanded(outer)
    expect(Expr.show(expanded)).toBe(Expr.show(distance(distance(fields.rank, 0), 1)))
    // A primitive predicate's arguments too.
    expect(Expr.show(Expr.expanded(past(size(fields.rank), 1)))).toBe(
      Expr.show(past(distance(fields.rank, 0), 1)),
    )
  })
})
