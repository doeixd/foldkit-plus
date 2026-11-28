import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Eq, Expr, Null, Num, Ord, Path } from '@doeixd/metakit'
import * as Conformance from '@doeixd/metakit/conformance'

describe('metakit/conformance (Galois & partial-eval soundness)', () => {
  const reports = Conformance.checkAllOps()

  it.each(reports)('holds $op to one answer over the awkward values', report => {
    expect(report.failures.slice(0, 5)).toEqual([])
    expect(report.checked).toBeGreaterThan(20)
  })

  it('covers every primitive', () => {
    expect(reports.map(report => report.op)).toEqual(Object.keys(Conformance.coreOps))
    expect(reports).toHaveLength(50)
  })

  it('verifies Tier 2 residualize & judge soundness against Tier 1 eval over Arbitrary environments', () => {
    const Account = Schema.Struct({
      id: Schema.String,
      balance: Schema.Int.check(Schema.isBetween({ minimum: -100, maximum: 100 })),
      reserved: Schema.Int.check(Schema.isBetween({ minimum: -100, maximum: 100 })),
      status: Schema.Literals(['open', 'frozen']),
      note: Schema.NullOr(Schema.String),
    })
    const Principal = Schema.Struct({
      userId: Schema.String,
      role: Schema.Literals(['owner', 'admin', 'guest']),
    })
    const Env = Schema.Struct({ row: Account, principal: Principal })

    const CanWithdraw = Expr.in({ row: Account, principal: Principal }, ({ row, principal }) =>
      Expr.all(
        Eq.is(row.status, 'open'),
        Expr.any(Eq.is(principal.role, 'admin'), Eq.is(row.id, principal.userId)),
        Ord.between(Num.clamp(row.balance, 0, 50), 0, 50),
        Expr.any(Null.isNull(row.note), Null.isNotNull(row.note)),
      ),
    )

    // Mask 1: only row known (client-side guard splitting)
    const r1 = Conformance.checkResidualizeSoundness(CanWithdraw, Env, env => ({ row: env.row }), {
      samples: 50,
    })
    expect(r1.ok).toBe(true)
    expect(r1.checked).toBe(50)

    // Mask 2: only principal known
    const r2 = Conformance.checkResidualizeSoundness(
      CanWithdraw,
      Env,
      env => ({ principal: env.principal }),
      { samples: 50 },
    )
    expect(r2.ok).toBe(true)

    // Mask 3: partial nested fields (only status and note known)
    const r3 = Conformance.checkResidualizeSoundness(
      CanWithdraw,
      Env,
      env => ({ row: { status: env.row.status, note: env.row.note } }),
      { samples: 50 },
    )
    expect(r3.ok).toBe(true)
  })

  it('reports the first environment where the residual gives a different answer', () => {
    const Env = Schema.Struct({ count: Schema.Literals([2, 3]) })
    const { count } = Path.forSchema(Env)
    const otherCount = ({ count }: typeof Env.Type): typeof Env.Type => ({
      count: count === 2 ? 3 : 2,
    })

    const report = Conformance.checkResidualizeSoundness(count, Env, otherCount, { samples: 5 })
    expect(report).toMatchObject({ ok: false, checked: 1 })
    const mismatch = report.mismatch
    if (mismatch === undefined) throw new Error('Expected the counterexample')
    expect(mismatch.full).toEqual(Result.succeed(mismatch.env.count))
    expect(mismatch.residual).toEqual(Result.succeed(otherCount(mismatch.env).count))
  })
})
