import { Effect, Option, Schema } from 'effect'
import { Eq, Expr, Num, Verdict } from 'metakit'
import * as Policy from 'metakit/policy'
import * as Prove from 'metakit/prove'
import { describe, expect, it } from 'vitest'

const Document = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  balance: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(Expr.refine($ => Num.gte($.balance, 0)))

const Principal = Schema.Struct({
  userId: Schema.String,
  role: Schema.Literals(['owner', 'editor', 'admin', 'guest']),
})

describe('metakit/policy (consistency, non-disclosure, opaque principal soundness)', () => {
  it('keeps a text code distinct from the same integer in a mixed enumeration', async () => {
    const policy = Policy.make({
      row: Schema.Struct({ code: Schema.Literals(['a', 1]) }),
      principal: Principal,
      rules: ({ row }) => ({ Update: Eq.is(row.code, 'a'), Read: Eq.is(row.code, 1) }),
    })
    expect(
      Verdict.isUnknown(await Effect.runPromise(Prove.policyImplies(policy, 'Update', 'Read'))),
    ).toBe(true)
  })
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
