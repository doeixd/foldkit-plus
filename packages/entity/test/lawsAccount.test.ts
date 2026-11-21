/**
 * `Laws.check` on the bank account of #600: a rule that cannot apply is kept,
 * numbers are decided from their declared bounds, every refusal carries a
 * witness, an undecided pair carries what a solver would have to prove, and
 * the report says what it stands on.
 */
import { Option, Schema } from 'effect'
import { Evidence } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Finding,
  Footprint,
  Laws,
  Write,
  type LawReport,
  type LawVerdict,
} from '../src/index.js'
import { Account, Open, operators, writes } from './accountFixture.js'

const check = (options: Parameters<typeof writes>[0]) =>
  Laws.check({ writes: writes(options), operators })

const pairOf = (report: LawReport, write: string, invariant: string) => {
  const pair = report.pairs.find(each => each.write === write && each.invariant === invariant)
  if (pair === undefined) throw new Error(`no pair ${write} x ${invariant}`)
  return pair
}
const verdict = (report: LawReport, write: string, invariant: string): LawVerdict =>
  pairOf(report, write, invariant).verdict

describe('A rule that cannot apply', () => {
  const report = check({})

  it.each([
    ['neverOverdrawn', ['balance']],
    ['withinDailyLimit', ['withdrawnToday']],
  ])('is kept: closing an account leaves %s nothing to bind', (rule, over) => {
    // `vacuous` no longer: the member is a plain `Schema.Number`, which may be
    // NaN, and a comparison refuses NaN before `or` is settled by its other
    // side; the bounds keep it instead.
    expect(verdict(report, 'CloseAccount', rule)).toMatchObject({
      _tag: 'Kept',
      by: 'bounds',
      over,
    })
    expect(
      Option.map(pairOf(report, 'CloseAccount', rule).evidence, record => record._tag),
    ).toEqual(Option.some('Bounded'))
  })
})

describe('A rule that cannot apply, over a number that cannot be NaN', () => {
  const Ledger = Entity.define(
    'Ledger',
    Schema.Struct({
      id: Schema.String,
      status: Schema.Literals(['open', 'closed']),
      balance: Schema.Finite,
    }),
  )
  const solvent = Entity.invariant<typeof Ledger>(
    'solvent',
    ({ after }) => Expr.or(Expr.not(Expr.eq(after.status, 'open')), Expr.gte(after.balance, 0)),
    { message: 'An open ledger is never below zero' },
  )
  const Kept = Ledger.pipe(solvent)
  const Opened = Entity.refine(Kept, 'Opened', { status: 'open' })
  const Shut = Entity.refine(Kept, 'Shut', { status: 'closed' })

  it('is kept as vacuous: the comparison it leaves open cannot refuse', () => {
    const close = Write.update(
      Entity.input(Kept, Schema.Struct({ id: Schema.String, status: Schema.Literal('closed') })),
      { id: 'id', from: Opened, becomes: Shut },
    )
    const report = Laws.check({ writes: [{ name: 'Close', write: close }] })
    expect(verdict(report, 'Close', 'solvent')).toMatchObject({
      _tag: 'Kept',
      by: 'vacuous',
      over: ['balance'],
    })
  })
})

describe('Numbers, decided from their bounds', () => {
  it('keeps a deposit of a non-negative amount, with a Bounded record', () => {
    const report = check({ nonNegative: true })
    expect(verdict(report, 'DepositMoney', 'neverOverdrawn')).toMatchObject({
      _tag: 'Kept',
      by: 'bounds',
      over: ['balance'],
    })
    const record = Option.getOrThrow(pairOf(report, 'DepositMoney', 'neverOverdrawn').evidence)
    expect(record).toEqual(
      Evidence.Bounded({ transition: 'write:DepositMoney', law: 'Account.neverOverdrawn' }),
    )
    expect(Evidence.issuedBy(record)).toEqual(Option.some('foldkit-entity/laws'))
  })

  it('refuses a deposit of any number, with the smallest witness', () => {
    expect(verdict(check({}), 'DepositMoney', 'neverOverdrawn')).toMatchObject({
      _tag: 'Refused',
      steps: [],
      witness: {
        before: Option.some({ status: 'open', balance: 0 }),
        input: { amount: -1 },
        after: { status: 'open', balance: -1 },
        invariant: 'neverOverdrawn',
        message: 'An open account is never overdrawn',
        path: ['status', 'balance'],
      },
      // Open is reached, by OpenAccount: no hint.
      hint: Option.none(),
    })
  })

  it('leaves a withdrawal within the balance undecided: it rests on a relation, a solver’s to prove', () => {
    const pair = pairOf(
      check({ nonNegative: true, when: 'withinBalance' }),
      'WithdrawMoney',
      'neverOverdrawn',
    )
    expect(pair.verdict).toMatchObject({
      _tag: 'Undecided',
      reason: 'it rests on comparing balance with amount, which intervals alone cannot use',
    })
    expect(pair.evidence).toEqual(Option.none())
  })

  it('turns red when the withdrawal’s when is weakened to allow an overdraft (#600)', () => {
    expect(
      verdict(
        check({ nonNegative: true, when: 'withinBalancePlusLimit' }),
        'WithdrawMoney',
        'neverOverdrawn',
      ),
    ).toMatchObject({
      _tag: 'Refused',
      witness: {
        before: Option.some({ status: 'open', balance: 0 }),
        input: { amount: 1 },
        after: { status: 'open', balance: -1 },
      },
    })
  })

  it('refuses a withdrawal nothing bounds against the daily limit, starting at the limit', () => {
    expect(
      verdict(
        check({ nonNegative: true, when: 'withinBalance' }),
        'WithdrawMoney',
        'withinDailyLimit',
      ),
    ).toMatchObject({
      _tag: 'Refused',
      witness: {
        before: Option.some({ status: 'open', withdrawnToday: 1000 }),
        input: { amount: 1 },
        after: { withdrawnToday: 1001 },
      },
    })
  })

  it('says which operator it cannot read through', () => {
    expect(
      verdict(
        check({ nonNegative: true, when: 'withinBalance', withdraw: 'opaqueMinus' }),
        'WithdrawMoney',
        'neverOverdrawn',
      ),
    ).toMatchObject({
      _tag: 'Undecided',
      reason:
        'bank.opaqueMinus declares no monotonic law for its argument 1, so its effect on a number is not known',
    })
  })

  it('refuses past the daily limit where the table cannot run the balance’s operator, which that rule does not read', () => {
    expect(
      verdict(
        // The kernel's table, which lacks `bank.opaqueMinus`.
        Laws.check({ writes: writes({ nonNegative: true, withdraw: 'opaqueMinus' }) }),
        'WithdrawMoney',
        'withinDailyLimit',
      ),
    ).toMatchObject({
      _tag: 'Refused',
      witness: { input: { amount: 1 }, after: { withdrawnToday: 1001 } },
    })
  })

  it('still refuses through such an operator: a witness is run, not bounded', () => {
    expect(
      verdict(check({ withdraw: 'opaqueMinus' }), 'WithdrawMoney', 'neverOverdrawn')._tag,
    ).toBe('Refused')
  })

  it('takes a decrement’s amount away: a non-negative one can overdraw', () => {
    expect(
      verdict(
        check({ nonNegative: true, withdraw: 'decrement' }),
        'WithdrawMoney',
        'neverOverdrawn',
      ),
    ).toMatchObject({
      _tag: 'Refused',
      witness: {
        before: Option.some({ status: 'open', balance: 0 }),
        input: { amount: 1 },
        after: { balance: -1 },
      },
    })
    expect(
      verdict(
        check({ nonNegative: true, withdraw: 'decrement', when: 'withinBalance' }),
        'WithdrawMoney',
        'neverOverdrawn',
      ),
    ).toMatchObject({ _tag: 'Undecided' })
  })
})

describe('What an undecided pair leaves a solver', () => {
  it('carries the write, the rule, the invariants assumed before, and the cases left', () => {
    const list = writes({ nonNegative: true, when: 'withinBalanceAndLimit' })
    const pair = pairOf(Laws.check({ writes: list, operators }), 'WithdrawMoney', 'neverOverdrawn')
    if (pair.verdict._tag !== 'Undecided') throw new Error('expected an undecided pair')
    const obligation = Option.getOrThrow(pair.verdict.obligation)
    expect(obligation.write).toBe(list[3].write)
    expect(obligation.rule.id).toBe('neverOverdrawn')
    expect(obligation.assumed.map(each => each.id)).toEqual(['neverOverdrawn', 'withinDailyLimit'])
    expect(obligation.cases).toEqual([
      { before: { status: 'open' }, input: {}, after: { status: 'open' } },
    ])
  })

  it('carries none for a transition known by its footprint alone', () => {
    const report = Laws.check({
      writes: [{ name: 'Import', entity: Account, footprint: Footprint.unknown }],
    })
    expect(verdict(report, 'Import', 'neverOverdrawn')).toMatchObject({
      _tag: 'Undecided',
      obligation: Option.none(),
    })
  })
})

describe('A write no row can meet', () => {
  const Overdraw = {
    name: 'Overdraw',
    write: Write.update(
      Entity.input(Account, Schema.Struct({ id: Schema.String, status: Schema.Literal('closed') })),
      { id: 'id', from: Open, when: () => Expr.lt(Account.fields.balance, 0) },
    ),
  }

  it('is reported: an open account is never overdrawn, so nothing starts it', () => {
    const report = Laws.check({ writes: [Overdraw, ...writes({})], operators })
    expect(report.findings.filter(Finding.$is('Unmeetable')).map(each => ({ ...each }))).toEqual([
      { ...Finding.Unmeetable({ entity: 'Account', write: 'Overdraw' }) },
    ])
  })
})

describe('A refusal from a state no write reaches', () => {
  const Doc = Entity.define(
    'LedgerDoc',
    Schema.Struct({
      id: Schema.String,
      status: Schema.Literals(['draft', 'live', 'archived']),
      score: Schema.Number,
    }),
  ).pipe(
    Entity.invariant(
      'archivedKeepsTen',
      ({ after }) =>
        Expr.or(Expr.not(Expr.eq(after.status, 'archived')), Expr.gte(after.score, 10)),
      { message: 'An archived doc keeps a score of ten' },
    ),
  )
  const Draft = Entity.refine(Doc, 'Draft', { status: 'draft' })
  const Live = Entity.refine(Doc, 'Live', { status: 'live' })
  Entity.refine(Doc, 'Archived', { status: 'archived' })
  const Publish = {
    name: 'Publish',
    write: Write.update(
      Entity.input(Doc, Schema.Struct({ id: Schema.String, status: Schema.Literal('live') })),
      { id: 'id', from: Draft, becomes: Live },
    ),
  }
  const Spend = {
    name: 'Spend',
    write: Write.update(
      Entity.input(
        Doc,
        Schema.Struct({
          id: Schema.String,
          amount: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
        }),
        { amount: Entity.unmapped },
      ),
      { id: 'id', compute: { score: ({ row, input }) => Expr.sub(row.score, input.amount) } },
    ),
  }

  it('says so, and that an invariant ruling the state out would settle the pair', () => {
    const report = Laws.check({ writes: [Publish, Spend], operators })
    expect(verdict(report, 'Spend', 'archivedKeepsTen')).toMatchObject({
      _tag: 'Refused',
      witness: { before: Option.some({ status: 'archived', score: 10 }), input: { amount: 1 } },
      hint: Option.some(
        'it starts Archived, which no declared write reaches: an invariant ruling that out would settle this pair',
      ),
    })
  })
})

describe('Laws.show on the account', () => {
  it('prints each witness under its pair, and what the report stands on', () => {
    expect(Laws.show(check({ nonNegative: true, when: 'withinBalance' }))).toBe(
      [
        'Account',
        '  Open -> Closed   CloseAccount   holds',
        '  Closed                          terminal',
        '',
        'OpenAccount     x neverOverdrawn              kept: 1 row enumerated',
        'OpenAccount     x withinDailyLimit            kept: 1 row enumerated',
        'OpenAccount     x aClosedAccountStaysClosed   kept: a create has no row before',
        'CloseAccount    x neverOverdrawn              kept: proved from the bounds on balance, for every row and input within them',
        'CloseAccount    x withinDailyLimit            kept: proved from the bounds on withdrawnToday, for every row and input within them',
        'CloseAccount    x aClosedAccountStaysClosed   kept: 1 row enumerated',
        'DepositMoney    x neverOverdrawn              kept: proved from the bounds on balance, for every row and input within them',
        'DepositMoney    x withinDailyLimit            kept: writes no member it reads',
        'DepositMoney    x aClosedAccountStaysClosed   kept: 1 row enumerated',
        'WithdrawMoney   x neverOverdrawn              undecided: it rests on comparing balance with amount, which intervals alone cannot use',
        'WithdrawMoney   x withinDailyLimit            refused: An open account withdraws no more than the daily limit',
        '    before   status: "open", withdrawnToday: 1000, balance: 1',
        '    input    amount: 1',
        '    after    status: "open", withdrawnToday: 1001, balance: 0',
        'WithdrawMoney   x aClosedAccountStaysClosed   kept: 2 rows enumerated',
        '',
        '1 entity, 2 states, 4 writes, 3 rules: 12 pairs, 10 kept, 1 refused, 1 undecided',
      ].join('\n'),
    )
  })

  it('counts what it stands on', () => {
    expect(check({}).totals).toEqual({
      entities: 1,
      states: 2,
      writes: 4,
      rules: 3,
      pairs: 12,
      kept: 9,
      refused: 3,
      undecided: 0,
    })
  })
})
