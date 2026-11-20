import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Null, Num, Ord, Path, Transition, Verdict } from 'metakit'

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)
type Account = typeof Account.Type

const Principal = Schema.Struct({
  userId: Schema.String,
  role: Schema.Literals(['owner', 'admin', 'guest']),
})

const CanWithdraw = Expr.in({ row: Account, principal: Principal }, ({ row, principal }) =>
  Expr.all(
    Eq.is(row.status, 'open'),
    Expr.any(Eq.is(principal.role, 'admin'), Eq.is(row.id, principal.userId)),
  ),
)

const AvailableBalance = Expr.in({ model: Account }, ({ model }) =>
  Num.sub(model.balance, model.reserved),
)

const WithdrawInput = Schema.Struct({
  amount: Schema.Int.pipe(Expr.refine($ => Num.gt($, 0))),
})

const Withdraw = Transition.make({
  state: Account,
  input: WithdrawInput,
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
  emits: ({ state, input }) => ({
    _tag: 'AccountDebited' as const,
    accountId: state.id,
    amount: input.amount,
  }),
})

describe('Path', () => {
  it('reads, composes, updates structurally, and preserves identity on no-op', () => {
    const outer = Path.field<{ readonly account: Account }, 'account'>('account')
    const inner = Path.field<Account, 'balance'>('balance')
    const composed = Path.compose(outer, inner)

    const acct: Account = { id: 'a1', balance: 100, reserved: 20, status: 'open' }
    const model = { account: acct }

    expect(Path.get(composed, model)).toEqual(Option.some(100))
    expect(Path.isPrefix(['account'], composed.segments)).toBe(true)
    expect(Path.isPrefix(['other'], composed.segments)).toBe(false)

    const same = Path.set(composed, model, 100)
    expect(same).toBe(model)

    const updated = Path.set(composed, model, 75)
    expect(updated).not.toBe(model)
    expect(updated.account.balance).toBe(75)
    expect(model.account.balance).toBe(100)

    // Prototype properties are never read as own fields in Path.get or Expr.eval
    const protoPath = Path.make<Record<string, unknown>, unknown>(['constructor'])
    expect(Path.get(protoPath, {})).toEqual(Option.none())
    expect(Expr.eval(protoPath, {})).toBeUndefined()
  })
})

describe('Schema + Expr.refine', () => {
  it('enforces invariants at runtime via Schema.decodeUnknownResult and exposes symbolic AST', () => {
    const decode = Schema.decodeUnknownResult(Account)
    expect(Result.isSuccess(decode({ id: 'a1', balance: 100, reserved: 40, status: 'open' }))).toBe(
      true,
    )
    expect(Result.isFailure(decode({ id: 'a1', balance: -1, reserved: 0, status: 'open' }))).toBe(
      true,
    )
    expect(Result.isFailure(decode({ id: 'a1', balance: 10, reserved: 20, status: 'open' }))).toBe(
      true,
    )

    const refs = Expr.refinementsOf(Account)
    expect(refs.length).toBe(1)
    expect(Expr.eval(refs[0]!, { id: 'a1', balance: 100, reserved: 40, status: 'open' })).toBe(true)
    expect(Expr.eval(refs[0]!, { id: 'a1', balance: 10, reserved: 40, status: 'open' })).toBe(false)
  })
})

describe('Expr evaluation, derived ops, and opaque terms', () => {
  it('evaluates guards, projections, derived functions, conditionals, match, and strings', () => {
    const acct: Account = { id: 'u1', balance: 100, reserved: 25, status: 'open' }
    expect(Expr.eval(AvailableBalance, { model: acct })).toBe(75)
    expect(Expr.eval(CanWithdraw, { row: acct, principal: { userId: 'u1', role: 'owner' } })).toBe(
      true,
    )
    expect(Expr.eval(CanWithdraw, { row: acct, principal: { userId: 'u2', role: 'admin' } })).toBe(
      true,
    )
    expect(Expr.eval(CanWithdraw, { row: acct, principal: { userId: 'u2', role: 'guest' } })).toBe(
      false,
    )

    // Derived algebra: ordinary TS function composing primitives
    const discount = <Env>(price: Expr.ExprInput<Env, number>, off: Expr.ExprInput<Env, number>) =>
      Num.max(0, Num.sub(price, off))

    const Net = Expr.in({ model: Account }, ({ model }) => discount(model.balance, model.reserved))
    expect(Expr.eval(Net, { model: acct })).toBe(75)

    const Label = Expr.in({ model: Account }, ({ model }) =>
      Expr.match(model.status, {
        open: 'Active',
        frozen: 'Locked',
      }),
    )
    expect(Expr.eval(Label, { model: acct })).toBe('Active')
    expect(Expr.eval(Label, { model: { ...acct, status: 'frozen' } })).toBe('Locked')

    // Derived helpers (min, max, abs, clamp, between, isNotNull) over If + 15 primitives
    const Derived = Expr.in({ model: Account }, ({ model }) =>
      Expr.all(
        Ord.between(Num.clamp(model.balance, 0, 50), 0, 50),
        Eq.is(Num.abs(Num.neg(model.reserved)), model.reserved),
        Eq.is(Num.min(model.balance, model.reserved), model.reserved),
        Null.isNotNull(model.id),
      ),
    )
    expect(Expr.eval(Derived, { model: acct })).toBe(true)

    // Implication and readable formatting
    const OpenImpliesPositive = Expr.in({ model: Account }, ({ model }) =>
      Expr.implies(Eq.is(model.status, 'open'), Num.gte(model.balance, 0)),
    )
    expect(Expr.eval(OpenImpliesPositive, { model: acct })).toBe(true)
    expect(
      Expr.eval(OpenImpliesPositive, { model: { ...acct, status: 'frozen', balance: -1 } }),
    ).toBe(true)
    expect(Expr.show(AvailableBalance)).toBe('(model.balance - model.reserved)')
    expect(Expr.show(CanWithdraw)).toContain('row.status == "open"')
  })

  it('tracks reads on opaque terms and degrades soundly to Unknown in judge', () => {
    const Custom = Expr.in({ row: Account, principal: Principal }, ({ row }) =>
      Expr.opaque({ name: 'isOdd', reads: [row.balance] }, env => env.row.balance % 2 === 1),
    )
    expect(Expr.reads(Custom)).toEqual(Option.some([['row', 'balance']]))

    // Known read slice -> opaque executes during partial evaluation
    const vKnown = Expr.judge(Custom, { row: { id: 'a', balance: 5, reserved: 0, status: 'open' } })
    expect(Verdict.isTrue(vKnown)).toBe(true)

    // Missing read slice -> stays Unknown
    const vUnknown = Expr.judge(Custom, {})
    expect(Verdict.isUnknown(vUnknown)).toBe(true)

    // Unbounded opaque -> Footprint.All (Option.none())
    const Unbounded = Expr.in({ row: Account }, () => Expr.opaque({ name: 'clock' }, () => true))
    expect(Option.isNone(Expr.reads(Unbounded))).toBe(true)
    expect(Verdict.isUnknown(Expr.judge(Unbounded, {}))).toBe(true)
  })
})

describe('Partial evaluation (residualize & judge)', () => {
  it('splits client/server guards using Kleene K3 short-circuiting', () => {
    const frozen: Account = { id: 'u1', balance: 100, reserved: 0, status: 'frozen' }
    const open: Account = { id: 'u1', balance: 100, reserved: 0, status: 'open' }

    // Frozen row folds to False on the client without needing principal
    expect(Verdict.isFalse(Expr.judge(CanWithdraw, { row: frozen }))).toBe(true)

    // Open row needs principal -> Unknown with missing-env obligation
    const pending = Expr.judge(CanWithdraw, { row: open })
    expect(Verdict.isUnknown(pending)).toBe(true)
    if (Verdict.isUnknown(pending)) {
      expect(pending.reason).toContain('principal')
    }

    // Residual expression drops the resolved status check and only reads principal
    const residual = Expr.residualize(CanWithdraw, { row: open })
    const residualReads = Expr.reads(residual)
    expect(Option.isSome(residualReads)).toBe(true)
    if (Option.isSome(residualReads)) {
      expect(residualReads.value.every(segs => segs[0] === 'principal')).toBe(true)
    }
  })

  it('keeps epistemic Unknown strictly separate from object-level null', () => {
    const NullableRow = Schema.Struct({
      ownerId: Schema.NullOr(Schema.String),
      label: Schema.NullOr(Schema.String),
    })
    const HasNoOwner = Expr.in({ row: NullableRow }, ({ row }) => Null.isNull(row.ownerId))
    const OwnerIsNull = Expr.in({ row: NullableRow }, ({ row }) => Eq.is(row.ownerId, null))

    // Known null is NOT Unknown: both fold to True
    expect(Verdict.isTrue(Expr.judge(HasNoOwner, { row: { ownerId: null, label: null } }))).toBe(
      true,
    )
    expect(Verdict.isTrue(Expr.judge(OwnerIsNull, { row: { ownerId: null, label: null } }))).toBe(
      true,
    )

    // Missing row IS Unknown
    expect(Verdict.isUnknown(Expr.judge(HasNoOwner, {}))).toBe(true)
  })

  it('prunes static slices for SSR live-frontier reduction', () => {
    const Page = Schema.Struct({
      featureFlag: Schema.Boolean,
      count: Schema.Int,
    })
    const View = Expr.in({ model: Page }, ({ model }) =>
      Expr.when(model.featureFlag, {
        then: Num.add(model.count, 1),
        else: 0,
      }),
    )
    const pruned = Expr.residualize(View, { model: { featureFlag: false } })
    expect(pruned.node._tag).toBe('Lit')
    expect(Expr.reads(pruned)).toEqual(Option.some([]))
  })

  it('applies declarative op.laws generically in residualize', () => {
    const $ = Path.forSchema(Account)
    expect(Expr.residualize(Num.sub($.balance, $.balance), {}).node).toEqual({
      _tag: 'Lit',
      value: 0,
    })
    expect(Expr.residualize(Num.mul(0, $.balance), {}).node).toEqual({ _tag: 'Lit', value: 0 })
    expect(Expr.residualize(Num.add($.balance, 0), {}).node).toEqual($.balance.node)
    expect(Expr.residualize(Num.neg(Num.neg($.balance)), {}).node).toEqual($.balance.node)
    expect(Expr.residualize(Expr.not(Expr.not(Eq.is($.status, 'open'))), {}).node).toEqual(
      Eq.is($.status, 'open').node,
    )
    expect(Expr.residualize(Eq.in($.status, []), {}).node).toEqual({ _tag: 'Lit', value: false })
    const singleton = Expr.residualize(Eq.in($.status, ['open']), {}).node
    expect(singleton._tag).toBe('Call')
    if (singleton._tag === 'Call') expect(singleton.op.id).toBe('eq.is')
  })
})

describe('Transition', () => {
  it('runs guarded updates, emits pure data, and computes can() affordances', () => {
    const open: Account = { id: 'u1', balance: 100, reserved: 20, status: 'open' }
    const frozen: Account = { id: 'u1', balance: 100, reserved: 20, status: 'frozen' }

    // UI/Agent affordance before input is supplied
    expect(Verdict.isFalse(Transition.can(Withdraw, { state: frozen }))).toBe(true)
    expect(Verdict.isUnknown(Transition.can(Withdraw, { state: open }))).toBe(true)
    expect(Verdict.isTrue(Transition.can(Withdraw, { state: open, input: { amount: 50 } }))).toBe(
      true,
    )
    expect(Verdict.isFalse(Transition.can(Withdraw, { state: open, input: { amount: 90 } }))).toBe(
      true,
    )

    // Execution
    const res = Transition.step(Withdraw, open, { amount: 50 })
    expect(Result.isSuccess(res)).toBe(true)
    if (Result.isSuccess(res)) {
      expect(res.success.state).toEqual({ id: 'u1', balance: 50, reserved: 20, status: 'open' })
      expect(res.success.emit).toEqual(
        Option.some({ _tag: 'AccountDebited', accountId: 'u1', amount: 50 }),
      )
    }

    // Refused when guard fails
    const refused = Transition.run(Withdraw, open, { amount: 90 })
    expect(Result.isFailure(refused)).toBe(true)
  })

  it('lifts child transitions into a parent model with propagated footprints', () => {
    interface AppModel {
      readonly account: Account
      readonly theme: string
    }
    const AppWithdraw = Transition.lift(Path.of<AppModel>().account, Withdraw)

    const fp = Transition.footprint(AppWithdraw)
    expect(fp.writes).toEqual([['account', 'balance']])
    expect(Option.isSome(fp.reads)).toBe(true)
    if (Option.isSome(fp.reads)) {
      expect(fp.reads.value).toContainEqual(['state', 'account', 'balance'])
      expect(fp.reads.value).toContainEqual(['state', 'account', 'reserved'])
      expect(fp.reads.value).toContainEqual(['state', 'account', 'status'])
    }

    const app: AppModel = {
      account: { id: 'u1', balance: 100, reserved: 20, status: 'open' },
      theme: 'dark',
    }
    const next = Transition.run(AppWithdraw, app, { amount: 30 })
    expect(Result.isSuccess(next)).toBe(true)
    if (Result.isSuccess(next)) {
      expect(next.success.account.balance).toBe(70)
      expect(next.success.theme).toBe('dark')
    }
  })

  it('evaluates simultaneous writes against pre-state', () => {
    const Pair = Schema.Struct({ a: Schema.Int, b: Schema.Int })
    const Swap = Transition.make({
      state: Pair,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.a, state.b), Transition.set(state.b, state.a)],
    })
    const res = Transition.run(Swap, { a: 1, b: 2 }, {})
    expect(res).toEqual(Result.succeed({ a: 2, b: 1 }))
  })

  it('refuses duplicate write targets at definition time', () => {
    const Pair = Schema.Struct({ a: Schema.Int })
    expect(() =>
      Transition.make({
        state: Pair,
        input: Schema.Struct({}),
        apply: ({ state }) => [Transition.set(state.a, 1), Transition.set(state.a, 2)],
      }),
    ).toThrow(/duplicate write target/)
  })
})

describe('Tier 3 synchronous Abstract checker (Interval + Zone)', () => {
  it('proves Withdraw preserves Account invariants synchronously via Zone', () => {
    const verdict = Abstract.checkTransition(Account, Withdraw)
    expect(Verdict.isTrue(verdict)).toBe(true)
    if (Verdict.isTrue(verdict)) {
      expect(verdict.evidence).toEqual(Option.some(Verdict.Proved('zone')))
    }
  })

  it('proves derived invariant balance - reserved >= 0, abs >= 0, and bool.or case-splitting in Tier 3', () => {
    const $ = Path.forSchema(Account)
    expect(Verdict.isTrue(Abstract.checkInvariant(Account, Num.gte($.balance, 0)))).toBe(true)
    expect(
      Verdict.isTrue(Abstract.checkInvariant(Account, Num.gte(Num.sub($.balance, $.reserved), 0))),
    ).toBe(true)
    // Derived abs(x) over If: Tier 3 narrows both branches to prove abs(x) >= 0!
    const AnyInt = Schema.Struct({ x: Schema.Int })
    const $x = Path.forSchema(AnyInt)
    expect(Verdict.isTrue(Abstract.checkInvariant(AnyInt, Ord.gte(Num.abs($x.x), 0)))).toBe(true)
    // Disjunction case-splitting: (x >= 10 || x >= 5) => x >= 5
    const Disj = Schema.Struct({ x: Schema.Int }).pipe(
      Expr.refine(s => Expr.any(Ord.gte(s.x, 10), Ord.gte(s.x, 5))),
    )
    expect(Verdict.isTrue(Abstract.checkInvariant(Disj, Ord.gte(Path.forSchema(Disj).x, 5)))).toBe(
      true,
    )
    // Non-nullable Schema field proves Null.isNotNull synchronously
    expect(Verdict.isTrue(Abstract.checkInvariant(Account, Null.isNotNull($.id)))).toBe(true)
    // Contradictory disjunction (x >= 0 AND (x < 0 || x < -1)) is vacuously True
    const Unsat = Schema.Struct({ x: Schema.Int }).pipe(
      Expr.refine(s => Expr.all(Ord.gte(s.x, 0), Expr.any(Ord.lt(s.x, 0), Ord.lt(s.x, -1)))),
    )
    expect(Verdict.isTrue(Abstract.checkInvariant(Unsat, Ord.lt(Path.forSchema(Unsat).x, 0)))).toBe(
      true,
    )
  })
})
