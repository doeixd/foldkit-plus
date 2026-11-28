import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Bool, Eq, Expr, Node, Num, Ord, Path, Verdict } from '../src/index.js'
import * as Conformance from '../src/conformance.js'
import * as Fn from '../src/fn.js'
import * as Interpreter from '../src/interpreter.js'
import * as Operation from '../src/operation.js'

const NonNeg = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0x7fff_ffff }))

describe('Decision 21: rewrite policy & checkOperation evidence (T8 #667)', () => {
  const add = Operation.define({
    id: 'test.t8.add',
    version: 1,
    args: [Flags, Flags],
    returns: Flags,
    nulls: 'strict',
    claims: {
      identity: { value: 0, side: 'both' },
      total: true,
    },
  })
  const imposter = Operation.define({
    id: 'test.t8.add',
    version: 1,
    args: [Flags, Flags],
    returns: Flags,
    nulls: 'strict',
    claims: {
      identity: { value: 99, side: 'both' },
    },
  })
  const honest = Operation.implementations(
    'honest',
    Operation.implement(add, (a, b) => a + b),
  )
  const lying = Operation.implementations(
    'lying',
    Operation.implement(add, (a, b) => a + b + 1),
  )
  const Row = Schema.Struct({ x: Flags })
  const $ = Path.from(Row)

  it('keeps foreign calls unrewritten when rewritePolicy is absent and removes foreignEvidence', () => {
    expect('foreignEvidence' in Expr).toBe(false)

    const call = add($.x, 0)
    const residual = Expr.residualize(call, {}, { foreign: honest })
    expect(Node.$is('Call')(residual.node)).toBe(true)
    expect(Verdict.isUnknown(Expr.judge(Eq.is(call, $.x), {}, { foreign: honest }))).toBe(true)

    const trusted = Expr.residualize(
      call,
      {},
      { foreign: honest, rewritePolicy: Expr.RewritePolicy.trusted },
    )
    expect(Node.$is('Path')(trusted.node)).toBe(true)
    expect(
      Verdict.isTrue(
        Expr.judge(
          Eq.is(call, $.x),
          {},
          { foreign: honest, rewritePolicy: Expr.RewritePolicy.trusted },
        ),
      ),
    ).toBe(true)
  })

  it('authorizes verified rewrites from checkOperation evidence, bound to descriptor and implementation, and never for total', () => {
    const call = add($.x, 0)
    const report = Conformance.checkOperation(add, honest)
    expect(report.ok).toBe(true)
    expect(report.evidence.length).toBeGreaterThan(0)

    // Empty evidence keeps the call
    const emptyPolicy = Expr.RewritePolicy.verified([])
    expect(
      Node.$is('Call')(
        Expr.residualize(call, {}, { foreign: honest, rewritePolicy: emptyPolicy }).node,
      ),
    ).toBe(true)

    // Evidence from checkOperation enables the rewrite for the matching descriptor & impl
    const verifiedPolicy = Expr.RewritePolicy.verified(report.evidence)
    expect(
      Node.$is('Path')(
        Expr.residualize(call, {}, { foreign: honest, rewritePolicy: verifiedPolicy }).node,
      ),
    ).toBe(true)
    expect(
      Verdict.isTrue(
        Expr.judge(Eq.is(call, $.x), {}, { foreign: honest, rewritePolicy: verifiedPolicy }),
      ),
    ).toBe(true)

    // Requiring 'proven' rejects 'tested' evidence from checkOperation
    const provenOnly = Expr.RewritePolicy.verified(report.evidence, { minAssurance: 'proven' })
    expect(
      Node.$is('Call')(
        Expr.residualize(call, {}, { foreign: honest, rewritePolicy: provenOnly }).node,
      ),
    ).toBe(true)

    // Different descriptor with the same id@version does not reuse evidence
    const imposterCall = imposter($.x, 99)
    expect(
      Node.$is('Call')(
        Expr.residualize(imposterCall, {}, { foreign: honest, rewritePolicy: verifiedPolicy }).node,
      ),
    ).toBe(true)

    // Rebinding to another implementation invalidates evidence
    expect(
      Node.$is('Call')(
        Expr.residualize(call, {}, { foreign: lying, rewritePolicy: verifiedPolicy }).node,
      ),
    ).toBe(true)

    // total yields no evidence in checkOperation yet
    const totalGuard = Bool.and(false, Eq.is(add($.x, 1), 0))
    expect(
      Verdict.isUnknown(
        Expr.judge(totalGuard, {}, { foreign: honest, rewritePolicy: verifiedPolicy }),
      ),
    ).toBe(true)
    expect(
      Verdict.isFalse(
        Expr.judge(totalGuard, {}, { foreign: honest, rewritePolicy: Expr.RewritePolicy.trusted }),
      ),
    ).toBe(true)
  })
})

describe('Decision 21: symbolic Fn calls are guarded by default (T2 #662)', () => {
  it('decodes literal arguments against parameter Schemas at call build time', () => {
    const inc = Fn.make({ x: Schema.Int }, ({ x }) => Num.add(x, 1))
    expect(() => inc({ x: 1.5 })).toThrow()
    expect(Expr.evaluate(inc({ x: 2 }), {})).toBe(3)
    expect(Expr.evaluate(inc.bare({ x: 1.5 }), {})).toBe(2.5)
  })

  it('guards parameter Schemas, non-nullness, where (false and null), returns, and ensures; bare opts out', () => {
    const Env = Schema.Struct({
      x: Schema.Int,
      cap: Schema.NullOr(Schema.Int),
    })
    const $ = Path.from(Env)
    const xOpen = Path.make<Readonly<Record<string, unknown>>, number>(['x'])

    const paramFn = Fn.make({ x: NonNeg }, ({ x }) => Num.add(x, 1))
    const paramCall = paramFn({ x: xOpen })
    expect(Expr.evalResult(paramCall, { x: 5 })).toEqual(Result.succeed(6))
    expect(Expr.evalResult(paramCall, { x: -1 })).toMatchObject({
      failure: { reason: 'unmatched', detail: expect.stringContaining('param') },
    })
    expect(Expr.evalResult(paramCall, { x: null })).toMatchObject({
      failure: { reason: 'unmatched', detail: expect.stringContaining('param') },
    })
    expect(Expr.evalResult(paramFn.bare({ x: xOpen }), { x: -1 })).toEqual(Result.succeed(0))

    const whereFn = Fn.make({ x: Schema.Int, cap: Schema.NullOr(Schema.Int) }, ({ x }) => x).where(
      ({ x, cap }) => Ord.lte(x, cap),
    )
    const whereCall = whereFn({ x: $.x, cap: $.cap })
    expect(Expr.evalResult(whereCall, { x: 5, cap: 10 })).toEqual(Result.succeed(5))
    expect(Expr.evalResult(whereCall, { x: 20, cap: 10 })).toMatchObject({
      failure: { reason: 'unmatched', detail: expect.stringContaining('where') },
    })
    // Null where condition must refuse (kills coalesce(cond, false) -> cond mutation)
    expect(Expr.evalResult(whereCall, { x: 5, cap: null })).toMatchObject({
      failure: { reason: 'unmatched', detail: expect.stringContaining('where') },
    })
    expect(Expr.evalResult(whereFn.bare({ x: $.x, cap: $.cap }), { x: 20, cap: 10 })).toEqual(
      Result.succeed(20),
    )
    expect(Expr.evaluate(whereFn.precondition({ x: $.x, cap: $.cap }), { x: 5, cap: 10 })).toBe(
      true,
    )

    const returnsFn = Fn.params({ x: Schema.Int })
      .returns(NonNeg)
      .body(({ x }) => Num.sub(x, 10))
    const returnsCall = returnsFn({ x: $.x })
    expect(Expr.evalResult(returnsCall, { x: 15, cap: null })).toEqual(Result.succeed(5))
    expect(Expr.evalResult(returnsCall, { x: 5, cap: null })).toMatchObject({
      failure: { reason: 'unmatched', detail: expect.stringContaining('returns') },
    })
    expect(Expr.evalResult(returnsFn.bare({ x: $.x }), { x: 5, cap: null })).toEqual(
      Result.succeed(-5),
    )

    const ensuresFn = Fn.make({ x: Schema.Int }, ({ x }) => Num.sub(x, 1)).ensures(
      ({ params, result }) => Ord.gte(result, params.x),
    )
    const ensuresCall = ensuresFn({ x: $.x })
    expect(Expr.evalResult(ensuresCall, { x: 5, cap: null })).toMatchObject({
      failure: { reason: 'unmatched', detail: expect.stringContaining('ensures') },
    })
    expect(Expr.evalResult(ensuresFn.bare({ x: $.x }), { x: 5, cap: null })).toEqual(
      Result.succeed(4),
    )
  })
})

describe('Decision 21: Interpreter.runFn always checks (T13)', () => {
  it('fails with FnContractError on a violated returns Schema without any checked option', async () => {
    const broken = Fn.params({ x: Schema.Int })
      .returns(NonNeg)
      .body(({ x }) => Num.sub(x, 10))

    const failed = await Effect.runPromise(Effect.result(Interpreter.runFn(broken, { x: 5 })))
    expect(Result.isFailure(failed)).toBe(true)
    if (Result.isFailure(failed)) {
      expect(failed.failure).toBeInstanceOf(Fn.FnContractError)
      expect(failed.failure.phase).toBe('returns')
    }

    const okVal = await Effect.runPromise(Interpreter.runFn(broken, { x: 15 }))
    expect(okVal).toBe(5)
  })
})
