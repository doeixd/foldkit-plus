import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Bool, Eq, Expr, Node, Ord, Path, Transition, Verdict } from '../src/index.js'
import * as Conformance from '../src/conformance.js'
import * as Operation from '../src/operation.js'

const Flags = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.check(Schema.isLessThanOrEqualTo(0x7fff_ffff)),
)

const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    identity: { value: 0, side: 'both' },
    absorbing: { value: 0x7fff_ffff, result: 0x7fff_ffff, side: 'both' },
    idempotent: true,
    commutative: true,
    associative: true,
  },
})

const flagsClamp = Operation.define({
  id: 'flags.clamp',
  version: 1,
  args: [Flags, Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    monotone: ['up', 'up', 'up'],
  },
})

const flagsNorm = Operation.define({
  id: 'flags.norm',
  version: 1,
  args: [Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    idempotent: true,
  },
})

const flagsSub = Operation.define({
  id: 'flags.subFrom',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    monotone: ['up', 'down'],
  },
})

const flagsMixed = Operation.define({
  id: 'flags.mixed',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    monotone: ['up', 'none'],
  },
})

const impls = Operation.implementations(
  'readers',
  Operation.implement(flagsOr, (a, b) => a | b),
  Operation.implement(flagsClamp, (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)),
  Operation.implement(flagsNorm, x => x & 0xff),
  Operation.implement(flagsSub, (a, b) => Math.max(0, a - b)),
  Operation.implement(flagsMixed, (a, b) => Math.min(a, b)),
)

const State = Schema.Struct({
  granted: Flags,
  maybe: Schema.NullOr(Flags),
  wide: Schema.Number,
  x: Flags,
  y: Flags,
})
const $ = Path.forSchema(State)

const trusted = {
  foreign: impls,
  rewritePolicy: Expr.RewritePolicy.trusted,
} satisfies Expr.ReaderOptions

describe('custom operation readers (partial evaluation and judge)', () => {
  it('rewrites identity when the operand lies within the argument Schema, not on a wider Schema', () => {
    const narrowed = Expr.residualize(flagsOr($.granted, 0), {}, trusted)
    expect(Node.$is('Path')(narrowed.node)).toBe(true)

    const nullable = Expr.residualize(flagsOr($.maybe, 0), {}, trusted)
    expect(Node.$is('Path')(nullable.node)).toBe(true)

    // Wide number may hold 2^31, which flagsOr refuses; must stay a Call.
    const wide = Expr.residualize(flagsOr($.wide, 0), {}, trusted)
    expect(Node.$is('Call')(wide.node)).toBe(true)

    // Without rewritePolicy, stays a Call.
    const noPolicy = Expr.residualize(flagsOr($.granted, 0), {}, { foreign: impls })
    expect(Node.$is('Call')(noPolicy.node)).toBe(true)

    // Without implementation, stays a Call.
    const unsupported = Expr.residualize(flagsOr($.granted, 0), {})
    expect(Node.$is('Call')(unsupported.node)).toBe(true)
  })

  it('rewrites absorbing only when the dropped operand cannot refuse and is non-null', () => {
    const absorbed = Expr.residualize(flagsOr($.granted, 0x7fff_ffff), {}, trusted)
    expect(Node.$is('Lit')(absorbed.node) && absorbed.node.value === 0x7fff_ffff).toBe(true)

    // Nullable operand may be null, where strict flagsOr returns null, not 0x7fffffff.
    const nullable = Expr.residualize(flagsOr($.maybe, 0x7fff_ffff), {}, trusted)
    expect(Node.$is('Call')(nullable.node)).toBe(true)

    const judged = Expr.judge(Eq.is(flagsOr($.granted, 0x7fff_ffff), 0x7fff_ffff), {}, trusted)
    expect(Verdict.isTrue(judged)).toBe(true)

    const judgedNullable = Expr.judge(
      Eq.is(flagsOr($.maybe, 0x7fff_ffff), 0x7fff_ffff),
      {},
      trusted,
    )
    expect(Verdict.isUnknown(judgedNullable)).toBe(true)
  })

  it('rewrites binary and unary idempotent calls', () => {
    const bin = Expr.residualize(flagsOr($.granted, $.granted), {}, trusted)
    expect(Node.$is('Path')(bin.node)).toBe(true)

    const un = Expr.residualize(flagsNorm(flagsNorm($.granted)), {}, trusted)
    expect(
      Node.$is('Call')(un.node) && un.node.args.length === 1 && Node.$is('Path')(un.node.args[0]!),
    ).toBe(true)

    const judgedBin = Expr.judge(Eq.is(flagsOr($.granted, $.granted), $.granted), {}, trusted)
    expect(Verdict.isTrue(judgedBin)).toBe(true)

    const judgedIdentity = Expr.judge(Eq.is(flagsOr($.granted, 0), $.granted), {}, trusted)
    expect(Verdict.isTrue(judgedIdentity)).toBe(true)

    // Reflexive Eq.is on a foreign call stays Unknown (a call may refuse), while
    // residualizing flagsOr(flagsNorm(flagsNorm($.granted)), flagsNorm($.granted))
    // collapses both unary and binary idempotence to flagsNorm($.granted).
    const collapsed = Expr.residualize(
      flagsOr(flagsNorm(flagsNorm($.granted)), flagsNorm($.granted)),
      {},
      trusted,
    )
    expect(
      Node.$is('Call')(collapsed.node) &&
        collapsed.node.op.id === flagsNorm.descriptor.id &&
        collapsed.node.args.length === 1 &&
        Node.$is('Path')(collapsed.node.args[0]!),
    ).toBe(true)
  })
})

describe('custom operation readers (abstract checker)', () => {
  it('bounds monotone custom calls when implementations are provided, and is Unknown without them', () => {
    const goal = Ord.lte(flagsClamp($.x, 0, 10), 10)
    expect(Verdict.isUnknown(Abstract.checkInvariant(State, goal))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(State, goal, { foreign: impls }))).toBe(true)
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(State, Ord.gte(flagsClamp($.x, 0, 10), 0), { foreign: impls }),
      ),
    ).toBe(true)
  })

  it('stays Unknown when an interval end is unbounded or non-integer for an integer argument Schema', () => {
    const Unbounded = Schema.Struct({ x: Schema.Int })
    const u = Path.forSchema(Unbounded)
    expect(
      Verdict.isUnknown(
        Abstract.checkInvariant(Unbounded, Ord.lte(flagsClamp(u.x, 0, 10), 10), { foreign: impls }),
      ),
    ).toBe(true)

    const Real = Schema.Struct({
      x: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 10 }))),
    })
    const r = Path.forSchema(Real)
    expect(
      Verdict.isUnknown(
        Abstract.checkInvariant(Real, Ord.lte(flagsClamp(r.x, 0, 10), 10), { foreign: impls }),
      ),
    ).toBe(true)
  })

  it('handles down and none monotone directions accurately', () => {
    const Small = Schema.Struct({
      x: Schema.Int.pipe(
        Schema.check(Schema.isGreaterThanOrEqualTo(0)),
        Schema.check(Schema.isLessThanOrEqualTo(10)),
      ),
      y: Schema.Int.pipe(
        Schema.check(Schema.isGreaterThanOrEqualTo(0)),
        Schema.check(Schema.isLessThanOrEqualTo(5)),
      ),
    })
    const s = Path.forSchema(Small)
    // flagsSub(100, x) with x in [0, 10] is in [90, 100].
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(Small, Ord.gte(flagsSub(100, s.x), 90), { foreign: impls }),
      ),
    ).toBe(true)
    expect(
      Verdict.isFalse(
        Abstract.checkInvariant(Small, Ord.lt(flagsSub(100, s.x), 90), { foreign: impls }),
      ),
    ).toBe(true)

    // 'none' position works on singleton literal, stays Unknown on non-singleton interval.
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(Small, Ord.lte(flagsMixed(s.x, 5), 5), { foreign: impls }),
      ),
    ).toBe(true)
    expect(
      Verdict.isUnknown(
        Abstract.checkInvariant(Small, Ord.lte(flagsMixed(s.x, s.y), 10), { foreign: impls }),
      ),
    ).toBe(true)
  })

  it('threads foreign implementations through Abstract.checkTransition', () => {
    const Capped = Schema.Struct({ x: Flags }).pipe(Expr.refine($ => Ord.lte($.x, 10)))
    const Input = Schema.Struct({ next: Flags })
    const step = Transition.make({
      state: Capped,
      input: Input,
      apply: ({ state, input }) => [Transition.set(state.x, flagsClamp(input.next, 0, 10))],
    })
    expect(Verdict.isUnknown(Abstract.checkTransition(Capped, step))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkTransition(Capped, step, { foreign: impls }))).toBe(true)
  })

  it('gates foreign claim rewrites on bound evidence in verified mode and invalidates on rebind (#648 P0 #3)', () => {
    // Operation claiming identity 0, with one honest impl and one lying impl (+1).
    const maybeAdd = Operation.define({
      id: 'test.maybeAdd',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { identity: { value: 0, side: 'both' } },
    })
    const honestImpls = Operation.implementations(
      'honest',
      Operation.implement(maybeAdd, (a, b) => a + b),
    )
    const lyingImpls = Operation.implementations(
      'lying',
      Operation.implement(maybeAdd, (a, b) => a + b + 1),
    )

    const expr = maybeAdd($.granted, 0)
    const eqExpr = Eq.is(expr, $.granted)

    // 1. Conservative verified mode with no evidence: refuses to rewrite -> preserves Call & Unknown, matching lyingImpls eval!
    const verifiedNoEvidence = {
      foreign: lyingImpls,
      rewritePolicy: Expr.RewritePolicy.verified([]),
    } satisfies Expr.ReaderOptions
    const keptResidual = Expr.residualize(expr, {}, verifiedNoEvidence)
    expect(Node.$is('Call')(keptResidual.node)).toBe(true)
    expect(Verdict.isUnknown(Expr.judge(eqExpr, {}, verifiedNoEvidence))).toBe(true)
    expect(
      Expr.evaluate(
        keptResidual,
        { granted: 5, maybe: null, wide: 0, x: 0, y: 0 },
        verifiedNoEvidence,
      ),
    ).toBe(6)

    // 2. Evidence produced by checkOperation ('tested'): fails against lyingImpls, succeeds against honestImpls, and does NOT satisfy 'proven'.
    const lyingReport = Conformance.checkOperation(maybeAdd, lyingImpls)
    expect(lyingReport.ok).toBe(false)
    expect(lyingReport.evidence).toEqual([])

    const honestReport = Conformance.checkOperation(maybeAdd, honestImpls)
    expect(honestReport.ok).toBe(true)
    expect(honestReport.evidence.length).toBeGreaterThan(0)

    expect(
      Node.$is('Call')(
        Expr.residualize(
          expr,
          {},
          {
            foreign: honestImpls,
            rewritePolicy: Expr.RewritePolicy.verified(honestReport.evidence, {
              minAssurance: 'proven',
            }),
          },
        ).node,
      ),
    ).toBe(true)

    // 3. Matching bound evidence at required assurance enables rewrite.
    const verifiedHonest = Expr.RewritePolicy.verified(honestReport.evidence)
    const rewritten = Expr.residualize(
      expr,
      {},
      {
        foreign: honestImpls,
        rewritePolicy: verifiedHonest,
      },
    )
    expect(Node.$is('Path')(rewritten.node)).toBe(true)
    expect(
      Verdict.isTrue(
        Expr.judge(
          eqExpr,
          {},
          {
            foreign: honestImpls,
            rewritePolicy: verifiedHonest,
          },
        ),
      ),
    ).toBe(true)

    // 4. Rebinding the same op id@version to a different implementation invalidates prior evidence!
    const afterRebind = Expr.residualize(
      expr,
      {},
      {
        foreign: lyingImpls,
        rewritePolicy: verifiedHonest,
      },
    )
    expect(Node.$is('Call')(afterRebind.node)).toBe(true)
    expect(
      Verdict.isUnknown(
        Expr.judge(
          eqExpr,
          {},
          {
            foreign: lyingImpls,
            rewritePolicy: verifiedHonest,
          },
        ),
      ),
    ).toBe(true)

    // 5. claims.total: parity between residualize and judge, gated by policy AND argument Schema fit!
    const totalCheck = Operation.define({
      id: 'test.isEvenFlag',
      version: 1,
      args: [Flags],
      returns: Schema.Boolean,
      nulls: 'strict',
      claims: { total: true },
    })
    const totalImpls = Operation.implementations(
      'total',
      Operation.implement(totalCheck, x => x % 2 === 0),
    )
    // checkOperation yields no evidence for total yet (T7)
    const totalReport = Conformance.checkOperation(totalCheck, totalImpls)
    expect(totalReport.evidence).toEqual([])

    // On $.granted (fits Flags): absent policy or verified without total evidence keeps Unknown/Call; trusted absorbs to False/Lit(false)!
    const onGranted = Bool.and(false, totalCheck($.granted))
    expect(
      Verdict.isUnknown(
        Expr.judge(
          onGranted,
          {},
          { foreign: totalImpls, rewritePolicy: Expr.RewritePolicy.verified(totalReport.evidence) },
        ),
      ),
    ).toBe(true)
    expect(
      Node.$is('Call')(
        Expr.residualize(
          onGranted,
          {},
          { foreign: totalImpls, rewritePolicy: Expr.RewritePolicy.verified(totalReport.evidence) },
        ).node,
      ),
    ).toBe(true)

    const trustedTotalOpts = {
      foreign: totalImpls,
      rewritePolicy: Expr.RewritePolicy.trusted,
    } satisfies Expr.ReaderOptions
    expect(Verdict.isFalse(Expr.judge(onGranted, {}, trustedTotalOpts))).toBe(true)
    const foldedTotal = Expr.residualize(onGranted, {}, trustedTotalOpts)
    expect(Node.$is('Lit')(foldedTotal.node) && foldedTotal.node.value === false).toBe(true)

    // On $.wide (Schema.Number — may be -5 or NaN, which fails Flags checkArgs!): must stay Unknown/Call in BOTH judge and residualize!
    const onWide = Bool.and(false, totalCheck($.wide))
    expect(Verdict.isUnknown(Expr.judge(onWide, {}, trustedTotalOpts))).toBe(true)
    expect(Node.$is('Call')(Expr.residualize(onWide, {}, trustedTotalOpts).node)).toBe(true)
  })
})
