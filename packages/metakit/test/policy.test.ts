import { Effect, Option, Schema } from 'effect'
import { Bool, Eq, Expr, Null, Num, Path, Verdict } from '@doeixd/metakit'
import { Text } from '@doeixd/metakit/domain'
import * as Policy from '@doeixd/metakit/policy'
import * as Prove from '@doeixd/metakit/prove'
import { describe, expect, it } from 'vitest'

// Text holding no NUL, so a comparison of ids is never refused and partial evaluation may drop it.
const Document = Schema.Struct({
  id: Text.schema,
  ownerId: Text.schema,
  balance: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(Expr.refine($ => Num.gte($.balance, 0)))

const Principal = Schema.Struct({
  userId: Text.schema,
  role: Schema.Literals(['owner', 'editor', 'admin', 'guest']),
})

describe('metakit/policy (consistency, non-disclosure, opaque principal soundness)', () => {
  it('keeps a text code distinct from the same integer in a mixed enumeration', async () => {
    const policy = Policy.make({
      row: Schema.Struct({ code: Schema.Literals(['a', 1]) }),
      principal: Principal,
      rules: ({ row }) => ({ Update: Eq.is(row.code, 'a'), Read: Eq.is(row.code, 1) }),
    })
    const verdict = await Effect.runPromise(Prove.policyImplies(policy, 'Update', 'Read'))
    // The solver names the path it cannot sort, not whichever operation met it first.
    expect(Verdict.isUnknown(verdict) && verdict.reason).toContain(
      'mixed literal types at row.code',
    )
  })
  // Every row may be updated, and is read where `x` is above zero or not above it. NaN is
  // neither: evaluation refuses to order it, so a rule that compares it allows nothing.
  const split = (x: typeof Schema.Number) =>
    Policy.make({
      row: Schema.Struct({ x }),
      principal: Principal,
      rules: ({ row }) => ({
        Update: Expr.lit(true),
        Read: Expr.any(Num.gt(row.x, 0), Num.lte(row.x, 0)),
        Neither: Expr.all(Bool.not(Num.gte(row.x, 1)), Bool.not(Num.lte(row.x, 2))),
      }),
    })

  it('proves nothing of a number that may be NaN, which no comparison orders', async () => {
    const policy = split(Schema.Number)
    const env = { row: { x: NaN }, principal: { userId: 'u', role: 'guest' as const } }
    expect((['Update', 'Read', 'Neither'] as const).map(rule => policy.allow(rule, env))).toEqual([
      true,
      false,
      false,
    ])
    const sync = [
      Policy.checkImplication(policy, 'Update', 'Read'),
      Policy.checkConsistent(policy, 'Neither'),
    ]
    const proved = await Effect.runPromise(
      Effect.all([
        Prove.policyImplies(policy, 'Update', 'Read'),
        Prove.policyConsistent(policy, 'Neither'),
      ]),
    )
    expect([...sync, ...proved].map(verdict => verdict._tag)).toEqual(Array(4).fill('Unknown'))
    // Each names the path; the synchronous check and the solver word the reason differently.
    expect(Verdict.isUnknown(sync[0]!) && sync[0].reason).toContain('"row.x" may ')
    expect(Verdict.isUnknown(proved[0]!) && proved[0].reason).toContain('"row.x" may hold NaN')
  }, 30_000)

  it('orders a number that is always finite', async () => {
    const policy = split(Schema.Finite)
    expect(Verdict.isTrue(Policy.checkImplication(policy, 'Update', 'Read'))).toBe(true)
    expect(Verdict.isFalse(Policy.checkConsistent(policy, 'Neither'))).toBe(true)
    expect(
      Verdict.isFalse(await Effect.runPromise(Prove.policyConsistent(policy, 'Neither'))),
    ).toBe(true)
  }, 30_000)

  // Whenever the antecedent allows, the number is not NaN, so `Positive => NonNegative` holds;
  // the synchronous check still says nothing of a rule that reads a number it cannot order.
  const positiveImpliesNonNegative = <Row extends Schema.Top>(row: Row) => {
    const x = Path.make<Policy.PolicyEnv<Row['Type'], typeof Principal.Type>, number>(['row', 'x'])
    const policy = Policy.make({
      row,
      principal: Principal,
      rules: () => ({ Positive: Num.gt(x, 0), NonNegative: Num.gte(x, 0) }),
    })
    return Policy.checkImplication(policy, 'Positive', 'NonNegative')
  }

  it('leaves a synchronous implication undecided where a rule reads a number it cannot order', () => {
    const undecided = {
      'a number that may be NaN': Schema.Struct({ x: Schema.Number }),
      'a number whose key may be absent': Schema.Struct({ x: Schema.optionalKey(Schema.Finite) }),
      'a number that may be null': Schema.Struct({ x: Schema.NullOr(Schema.Int) }),
    }
    for (const [label, row] of Object.entries(undecided)) {
      expect(Verdict.isUnknown(positiveImpliesNonNegative(row)), label).toBe(true)
    }
    expect(Verdict.isTrue(positiveImpliesNonNegative(Schema.Struct({ x: Schema.Finite })))).toBe(
      true,
    )
  })

  it('proves nothing of a number whose key may be absent', () => {
    const row = Schema.Struct({ x: Schema.optionalKey(Schema.Finite) })
    const x = Path.make<Policy.PolicyEnv<typeof row.Type, typeof Principal.Type>, number>([
      'row',
      'x',
    ])
    const policy = Policy.make({
      row,
      principal: Principal,
      rules: () => ({
        Update: Expr.lit(true),
        Read: Expr.any(Num.gt(x, 0), Num.lte(x, 0)),
      }),
    })
    expect(policy.allow('Read', { row: {}, principal: { userId: 'u', role: 'guest' } })).toBe(false)
    expect(Verdict.isUnknown(Policy.checkImplication(policy, 'Update', 'Read'))).toBe(true)
  })

  it('takes a comparison of a null for one that does not hold', async () => {
    const row = Schema.Struct({ x: Schema.NullOr(Schema.Int) })
    type Env = Policy.PolicyEnv<typeof row.Type, typeof Principal.Type>
    // A comparison of null is null, so a null `x` is not "between zero and zero".
    const compared = Path.make<Env, number>(['row', 'x'])
    const policy = Policy.make({
      row,
      principal: Principal,
      rules: ({ row }) => ({
        Zeroed: Expr.all(Num.gte(compared, 0), Num.lte(compared, 0)),
        Zero: Eq.is(row.x, 0),
        Empty: Null.isNull(row.x),
      }),
    })
    const env = { row: { x: null }, principal: { userId: 'u', role: 'guest' as const } }
    expect((['Zeroed', 'Zero', 'Empty'] as const).map(rule => policy.allow(rule, env))).toEqual([
      false,
      false,
      true,
    ])
    // The synchronous check may leave it undecided; it may not refute it.
    expect(Verdict.isFalse(Policy.checkImplication(policy, 'Zeroed', 'Zero'))).toBe(false)
    expect(Verdict.isTrue(Policy.checkImplication(policy, 'Empty', 'Empty'))).toBe(true)
    // The solver holds null apart from zero: where `Zeroed` holds, `x` is zero and not null.
    const run = Effect.runPromise
    expect(Verdict.isTrue(await run(Prove.policyImplies(policy, 'Zeroed', 'Zero')))).toBe(true)
    // `Empty` holds of a null `x`, where `Zeroed` does not: a replayed counterexample.
    const refuted = await run(Prove.policyImplies(policy, 'Empty', 'Zeroed'))
    expect(Verdict.isFalse(refuted) && refuted.witness).toEqual(
      Option.some({
        'row.x': null,
        'principal.userId': expect.any(String),
        'principal.role': expect.any(String),
      }),
    )
  }, 30_000)

  it('takes a number of no single schema for one that may hold a fraction', async () => {
    const policy = Policy.make({
      row: Schema.Struct({ x: Schema.Union([Schema.Finite, Schema.Int]) }),
      principal: Principal,
      rules: ({ row }) => ({ Update: Num.gt(row.x, 0), Read: Num.gte(row.x, 1) }),
    })
    const verdict = await Effect.runPromise(Prove.policyImplies(policy, 'Update', 'Read'))
    const half = Verdict.isFalse(verdict) ? Option.getOrThrow(verdict.witness)['row.x'] : undefined
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)
  }, 30_000)

  it('requires a reachable antecedent to refute an implication', () => {
    const policy = Policy.make({
      row: Document,
      principal: Principal,
      rules: () => ({ Update: Expr.opaque({ name: 'staff' }, () => false), Read: Expr.lit(false) }),
    })
    expect(Verdict.isUnknown(Policy.checkImplication(policy, 'Update', 'Read'))).toBe(true)
  })

  it('validates a satisfying assignment against checks outside the solver theory', async () => {
    const policy = Policy.make({
      row: Schema.Struct({ code: Schema.String.check(Schema.isMinLength(4)) }),
      principal: Principal,
      rules: ({ row }) => ({ Update: Eq.is(row.code, 'a') }),
    })
    expect(
      Verdict.isUnknown(await Effect.runPromise(Prove.policyConsistent(policy, 'Update'))),
    ).toBe(true)
  })
  it('evaluates runtime allow() and partial-evaluation can() hints before row or principal arrives', () => {
    const DocPolicy = Policy.make({
      row: Document,
      principal: Principal,
      rules: ({ row, principal }) => ({
        Read: Expr.any(Eq.is(row.ownerId, principal.userId), Eq.is(principal.role, 'admin')),
        Update: Expr.all(
          Eq.is(row.status, 'open'),
          Expr.any(Eq.is(row.ownerId, principal.userId), Eq.is(principal.role, 'admin')),
        ),
        AdminOnly: Eq.is(principal.role, 'admin'),
      }),
    })

    const doc = { id: 'd1', ownerId: 'u1', balance: 100, status: 'open' as const }
    const owner = { userId: 'u1', role: 'owner' as const }
    const guest = { userId: 'u2', role: 'guest' as const }

    expect(DocPolicy.allow('Update', { row: doc, principal: owner })).toBe(true)
    expect(DocPolicy.allow('Update', { row: doc, principal: guest })).toBe(false)

    // Partial evaluation with only { principal }: AdminOnly is False for guest without needing any row!
    expect(Verdict.isFalse(DocPolicy.can('AdminOnly', { principal: guest }))).toBe(true)
    // Partial evaluation with only { row: frozen }: Update is False without needing principal!
    expect(Verdict.isFalse(DocPolicy.can('Update', { row: { ...doc, status: 'frozen' } }))).toBe(
      true,
    )
  })

  it('proves non-disclosure (Update => Read) and refutes leaky policies with a concrete counterexample', async () => {
    const SafePolicy = Policy.make({
      row: Document,
      principal: Principal,
      rules: ({ row, principal }) => ({
        Read: Expr.any(Eq.is(row.ownerId, principal.userId), Eq.is(principal.role, 'admin')),
        Update: Expr.all(
          Eq.is(row.status, 'open'),
          Expr.any(Eq.is(row.ownerId, principal.userId), Eq.is(principal.role, 'admin')),
        ),
      }),
    })

    const safeImplication = await Effect.runPromise(
      Prove.policyImplies(SafePolicy, 'Update', 'Read'),
    )
    expect(Verdict.isTrue(safeImplication)).toBe(true)

    // Leaky policy: an editor can Update even when they cannot Read (not owner and not admin)
    const LeakyPolicy = Policy.make({
      row: Document,
      principal: Principal,
      rules: ({ row, principal }) => ({
        Read: Expr.any(Eq.is(row.ownerId, principal.userId), Eq.is(principal.role, 'admin')),
        Update: Expr.all(Eq.is(row.status, 'open'), Eq.is(principal.role, 'editor')),
      }),
    })

    const leakyVerdict = await Effect.runPromise(Prove.policyImplies(LeakyPolicy, 'Update', 'Read'))
    expect(Verdict.isFalse(leakyVerdict)).toBe(true)
    if (Verdict.isFalse(leakyVerdict)) {
      expect(Option.isSome(leakyVerdict.witness)).toBe(true)
      if (Option.isSome(leakyVerdict.witness)) {
        expect(leakyVerdict.witness.value['principal.role']).toBe('editor')
        expect(leakyVerdict.witness.value['row.status']).toBe('open')
      }
    }
  }, 30_000)

  it('detects dead / unsatisfiable allow rules synchronously in Tier 3 and via Z3', async () => {
    const PolicyWithDeadRules = Policy.make({
      row: Document,
      principal: Principal,
      rules: ({ row, principal }) => ({
        Reachable: Eq.is(principal.role, 'admin'),
        ContradictoryStatus: Expr.all(Eq.is(row.status, 'open'), Eq.is(row.status, 'frozen')),
        ViolatesRowInvariant: Num.lt(row.balance, 0),
      }),
    })

    // Tier 3 synchronously catches both dead rules without booting Z3
    expect(
      Verdict.isFalse(Policy.checkConsistent(PolicyWithDeadRules, 'ContradictoryStatus')),
    ).toBe(true)
    expect(
      Verdict.isFalse(Policy.checkConsistent(PolicyWithDeadRules, 'ViolatesRowInvariant')),
    ).toBe(true)

    // Z3 confirms Reachable is satisfiable and dead rules are unsatisfiable
    expect(
      Verdict.isTrue(
        await Effect.runPromise(Prove.policyConsistent(PolicyWithDeadRules, 'Reachable')),
      ),
    ).toBe(true)
    expect(
      Verdict.isFalse(
        await Effect.runPromise(Prove.policyConsistent(PolicyWithDeadRules, 'ContradictoryStatus')),
      ),
    ).toBe(true)
  }, 30_000)

  it('models opaque server-only principal checks soundly as free Bools (never bogus False)', async () => {
    const isAdmin = Expr.opaque<
      Policy.PolicyEnv<typeof Document.Type, typeof Principal.Type>,
      boolean
    >({ name: 'isAdmin' }, ({ principal }) => principal.role === 'admin')

    const OpaquePolicy = Policy.make({
      row: Document,
      principal: Principal,
      rules: ({ row }) => ({
        AdminRead: isAdmin,
        AdminUpdate: Expr.all(isAdmin, Eq.is(row.status, 'open')),
        PublicRead: Eq.is(row.status, 'open'),
      }),
    })

    // AdminUpdate => AdminRead holds unconditionally even though isAdmin is opaque!
    const holds = await Effect.runPromise(
      Prove.policyImplies(OpaquePolicy, 'AdminUpdate', 'AdminRead'),
    )
    expect(Verdict.isTrue(holds)).toBe(true)

    // PublicRead => AdminRead depends on opaque isAdmin: MUST return Unknown (never bogus False!)
    const undecided = await Effect.runPromise(
      Prove.policyImplies(OpaquePolicy, 'PublicRead', 'AdminRead'),
    )
    expect(Verdict.isUnknown(undecided)).toBe(true)
  }, 30_000)
})
