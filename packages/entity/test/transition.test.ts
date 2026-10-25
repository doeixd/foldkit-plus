/**
 * Transition invariants: what every update must hold over the row before it
 * and the row after, judged over two rows by the reference evaluator, and
 * substituted for an interpreter that judges one in a statement.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, truthOver } from '../src/index.js'

const OrderFields = Entity.define(
  'Order',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'placed', 'shipped']),
    total: Schema.Number,
    paid: Schema.NullOr(Schema.Number),
  }),
)
const Order = OrderFields.pipe(
  Entity.invariant(
    'shippedStaysShipped',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(before.status, 'shipped')), Expr.eq(after.status, 'shipped')),
    { message: 'A shipped order stays shipped', path: ['status'] },
  ),
  // Relates a field after to another before: paying never lowers the total.
  Entity.invariant(
    'totalNeverFalls',
    ({ before, after }) => Expr.gte(after.total, Expr.field(before.total)),
    {
      message: 'The total cannot fall',
    },
  ),
)

const placed = { id: 'o1', status: 'placed', total: 10, paid: null }
const shipped = { ...placed, status: 'shipped' }
const failing = (...ids: ReadonlyArray<string>) => ({
  _tag: 'Invalid',
  failures: ids.map(id => expect.objectContaining({ id })),
})

describe('A transition invariant', () => {
  it('judges the change from one row to another, each valid on its own', () => {
    expect(Entity.judge(Order, { before: placed, after: shipped })).toEqual({ _tag: 'Valid' })
    expect(Entity.judge(Order, { before: shipped, after: shipped })).toEqual({ _tag: 'Valid' })
    expect(Entity.judge(Order, { before: shipped, after: placed })).toEqual(
      failing('shippedStaysShipped'),
    )
    expect(Entity.judge(Order, { before: placed, after: { ...placed, total: 9 } })).toEqual(
      failing('totalNeverFalls'),
    )
  })

  it('fails on a null on either side, and is undecided over a field either row lacks', () => {
    expect(Entity.judge(Order, { before: placed, after: { ...placed, total: null } })).toEqual(
      failing('totalNeverFalls'),
    )
    const { total: _, ...partial } = placed
    expect(Entity.judge(Order, { before: partial, after: placed })).toEqual({
      _tag: 'Undecided',
      fields: ['total'],
    })
  })

  it('reads what it reads of each row, and its path defaults to them', () => {
    const [stays, never] = Entity.invariants(Order)
    expect([stays?.before, stays?.after]).toEqual([['status'], ['status']])
    expect([never?.before, never?.after, never?.path]).toEqual([['total'], ['total'], ['total']])
  })

  it('is refused where it is declared for an id the Entity has already', () => {
    expect(() =>
      Order.pipe(
        Entity.invariant('totalNeverFalls', ({ after }) => Expr.gte(after.total, 0), {
          message: 'x',
        }),
      ),
    ).toThrow('declared twice')
  })

  it('is judged only of a change: a create, with no row before, judges state invariants alone', () => {
    const Priced = Order.pipe(
      Entity.invariant('totalNotNegative', ({ after }) => Expr.gte(after.total, 0), {
        message: 'x',
      }),
    )
    expect(Entity.invariants(Priced).map(Entity.readsBefore)).toEqual([true, true, false])
    // Lower than any total before, yet nothing came before: only the state invariant speaks.
    expect(Entity.judge(Priced, { after: { ...placed, total: 1 } })).toEqual({ _tag: 'Valid' })
    expect(Entity.judge(Priced, { after: { ...placed, total: -1 } })).toEqual(
      failing('totalNotNegative'),
    )
  })

  it('refuses one that reads an input of its own', () => {
    expect(() =>
      OrderFields.pipe(
        Entity.invariant(
          'input',
          ({ after }) => Expr.gte(after.total, Expr.input('least', Schema.Number)),
          { message: 'x' },
        ),
      ),
    ).toThrow('reads the input least')
  })
})

describe('Expr.substituteNext', () => {
  const [stays] = Entity.invariants(Order)

  it('reads a field the write sets as its value after, and leaves the rest to the row after', () => {
    // Setting the status back: before is the row's, after is the value.
    const back = Expr.substituteNext(stays!.predicate, { status: 'placed' })
    expect(truthOver(back, shipped)).toBe(false)
    expect(truthOver(back, placed)).toBe(true)
    // A value it does not name stays the row after's to give.
    const open = Expr.substituteNext(stays!.predicate, { total: 12 })
    expect(truthOver(open, shipped, {}, shipped)).toBe(true)
    expect(truthOver(open, shipped, {}, placed)).toBe(false)
  })
})
