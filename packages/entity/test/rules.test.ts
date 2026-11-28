/**
 * Saying a rule's kind and its state once: `Entity.invariant`'s `in`, which
 * binds a rule to the rows a write leaves in a state, and `Entity.transition`,
 * the same rule kept for one that reads the row before.
 */
import { Schema } from 'effect'
import { Node } from 'metakit'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Relation, type AfterRow, type BeforeRow } from '../src/index.js'

const fields = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(['open', 'closed']),
  balance: Schema.Number,
})
/** A fresh Account per case: a rule is the Entity's, so cases must not share one. */
const account = () => Entity.define('Account', fields)

const open = { id: 'a', status: 'open', balance: 5 }
const overdrawn = (status: string) => ({ id: 'a', status, balance: -1 })

describe('An invariant in a state', () => {
  it('is the rule implied by the state, judged only where a row is in it', () => {
    const Account = account()
    const Open = Entity.refine(Account, 'Open', { status: 'open' })
    Account.pipe(
      Entity.invariant('neverOverdrawn', ({ after }) => Expr.gte(after.balance, 0), {
        message: 'An open account is never overdrawn',
        in: Open,
      }),
    )
    const [rule] = Entity.invariants(Account)
    expect(Node.key(rule!.predicate.node)).toBe(
      Node.key(Expr.implies(Open.after, Expr.gte(Expr.next(Account.fields.balance), 0)).node),
    )
    expect(rule!.after).toEqual(['status', 'balance'])
    expect(rule!.path).toEqual(['status', 'balance'])
    expect(Entity.judge(Account, { after: open })._tag).toBe('Valid')
    expect(Entity.judge(Account, { after: overdrawn('open') })._tag).toBe('Invalid')
    expect(Entity.judge(Account, { after: overdrawn('closed') })._tag).toBe('Valid')
  })

  it('is refused for a state of another Entity', () => {
    const Other = account()
    const Elsewhere = Entity.refine(Other, 'Open', { status: 'open' })
    expect(() =>
      account().pipe(
        Entity.invariant('neverOverdrawn', ({ after }) => Expr.gte(after.balance, 0), {
          message: 'm',
          in: Elsewhere,
        }),
      ),
    ).toThrow(
      'Entity.invariant on Account: "neverOverdrawn" is in Account.Open, a state of another Entity',
    )
  })

  it('is refused for a state that reaches another row', () => {
    const Owner = Entity.define('Owner', Schema.Struct({ id: Schema.String, vip: Schema.Boolean }))
    const { Account } = Entity.relate(
      { Owner, Account: account() },
      { Account: { holder: Relation.one(Owner) } },
    )
    const Vip = Entity.refine(Account, 'Vip', () =>
      Expr.eq(Expr.path(Account.relations.holder, Owner.fields.vip), true),
    )
    expect(() =>
      Account.pipe(
        Entity.invariant('neverOverdrawn', ({ after }) => Expr.gte(after.balance, 0), {
          message: 'm',
          in: Vip,
        }),
      ),
    ).toThrow('"neverOverdrawn" is in Account.Vip, which reaches another row')
  })
})

describe('A transition', () => {
  it('stores the rule an invariant over the same change stores, and reads the row before', () => {
    const Account = account()
    const staysClosed = (rows: {
      readonly before: BeforeRow<typeof Account>
      readonly after: AfterRow<typeof Account>
    }) => Expr.implies(Expr.eq(rows.before.status, 'closed'), Expr.eq(rows.after.status, 'closed'))
    Account.pipe(
      Entity.transition('asTransition', staysClosed, { message: 'A closed account stays closed' }),
      Entity.invariant('asInvariant', staysClosed, { message: 'A closed account stays closed' }),
    )
    const [transition, invariant] = Entity.invariants(Account)
    const stored = (rule: NonNullable<typeof transition>) => ({
      ...rule,
      id: 'same',
      predicate: Node.key(rule.predicate.node),
    })
    expect(stored(transition!)).toEqual(stored(invariant!))
    expect(Entity.readsBefore(transition!)).toBe(true)
    expect(Entity.judge(Account, { before: overdrawn('closed'), after: open })._tag).toBe('Invalid')
    expect(Entity.judge(Account, { after: open })._tag).toBe('Valid')
  })

  it('is refused when it reads nothing of the row before, which is an invariant', () => {
    expect(() =>
      account().pipe(
        Entity.transition('covered', ({ after }) => Expr.gte(after.balance, 0), { message: 'm' }),
      ),
    ).toThrow(
      'Entity.transition on Account: "covered" reads no field of `before`, so it is a rule of one row; declare it with Entity.invariant',
    )
  })

  it('takes a state as an invariant does, over the row after', () => {
    const Account = account()
    const Closed = Entity.refine(Account, 'Closed', { status: 'closed' })
    Account.pipe(
      Entity.transition(
        'closedKeepsItsBalance',
        ({ before, after }) => Expr.eq(after.balance, before.balance),
        {
          message: 'A closed account keeps its balance',
          in: Closed,
        },
      ),
    )
    const closed = { id: 'a', status: 'closed', balance: 5 }
    expect(Entity.judge(Account, { before: closed, after: { ...closed, balance: 6 } })._tag).toBe(
      'Invalid',
    )
    expect(Entity.judge(Account, { before: open, after: { ...open, balance: 6 } })._tag).toBe(
      'Valid',
    )
  })
})
