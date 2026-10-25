/**
 * Transitions: what every update must hold over the row before it and the row
 * after, judged as a row and an input by the reference evaluator, and rewritten
 * for an interpreter that judges it in one statement.
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
  Entity.transition(
    'shippedStaysShipped',
    ({ before, after }) =>
      Expr.or(Expr.not(Expr.eq(before.status, 'shipped')), Expr.eq(after.status, 'shipped')),
    { message: 'A shipped order stays shipped', path: ['status'] },
  ),
  // Relates a field after to another before: paying never lowers the total.
  Entity.transition(
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

describe('A transition', () => {
  it('judges the change from one row to another, each valid on its own', () => {
    expect(Entity.judgeChange(Order, placed, shipped)).toEqual({ _tag: 'Valid' })
    expect(Entity.judgeChange(Order, shipped, shipped)).toEqual({ _tag: 'Valid' })
    expect(Entity.judgeChange(Order, shipped, placed)).toEqual(failing('shippedStaysShipped'))
    expect(Entity.judgeChange(Order, placed, { ...placed, total: 9 })).toEqual(
      failing('totalNeverFalls'),
    )
  })

  it('fails on a null on either side, and is undecided over a field either row lacks', () => {
    expect(Entity.judgeChange(Order, placed, { ...placed, total: null })).toEqual(
      failing('totalNeverFalls'),
    )
    const { total: _, ...partial } = placed
    expect(Entity.judgeChange(Order, partial, placed)).toEqual({
      _tag: 'Undecided',
      fields: ['total'],
    })
  })

  it('reads what it reads of each row, and its path defaults to them', () => {
    const [stays, never] = Entity.transitions(Order)
    expect([stays?.before, stays?.after]).toEqual([['status'], ['status']])
    expect([never?.before, never?.after, never?.path]).toEqual([['total'], ['total'], ['total']])
  })

  it.each([
    [
      'an id declared twice',
      () =>
        Order.pipe(
          Entity.transition('totalNeverFalls', ({ after }) => Expr.gte(after.total, 0), {
            message: 'x',
          }),
        ),
    ],
    [
      'an id an invariant has',
      () =>
        OrderFields.pipe(
          Entity.invariant('taken', f => Expr.gte(f.total, 0), { message: 'x' }),
          Entity.transition('taken', ({ after }) => Expr.gte(after.total, 0), { message: 'x' }),
        ),
    ],
    [
      'an invariant with an id a transition has',
      () =>
        Order.pipe(
          Entity.invariant('totalNeverFalls', f => Expr.gte(f.total, 0), { message: 'x' }),
        ),
    ],
  ])('is refused where it is declared: %s', (_, declare) => {
    expect(declare).toThrow('declared twice')
  })

  it('refuses one that reads an input of its own', () => {
    expect(() =>
      OrderFields.pipe(
        Entity.transition(
          'input',
          ({ after }) => Expr.gte(after.total, Expr.input('least', Schema.Number)),
          { message: 'x' },
        ),
      ),
    ).toThrow('reads the input least')
  })
})

describe('Entity.changeOver', () => {
  const [stays, never] = Entity.transitions(Order)

  it('reads what the write sets after as its value, and what it leaves alone as the field', () => {
    // Setting the status back: the field before is read from the row, the one after is the value.
    const back = Entity.changeOver(stays!, { status: 'placed' }, new Set())
    expect(truthOver(back, shipped)).toBe(false)
    expect(truthOver(back, placed)).toBe(true)
    // A write that leaves the status alone holds it, whatever the row.
    const untouched = Entity.changeOver(stays!, { total: 12 }, new Set())
    expect(truthOver(untouched, shipped)).toBe(true)
  })

  it('reads a field it moves under its own key, for the interpreter to bind', () => {
    const moved = Entity.changeOver(never!, {}, new Set(['total']))
    expect(truthOver(moved, { ...placed, 'after:total': 9 })).toBe(false)
    expect(truthOver(moved, { ...placed, 'after:total': 11 })).toBe(true)
  })
})
