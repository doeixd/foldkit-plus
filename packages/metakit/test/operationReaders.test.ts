import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Node, Ord, Path, Transition, Verdict } from '../src/index.js'
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

describe('custom operation readers (partial evaluation and judge)', () => {
  it('rewrites identity when the operand lies within the argument Schema, not on a wider Schema', () => {
    const narrowed = Expr.residualize(flagsOr($.granted, 0), {}, { foreign: impls })
    expect(Node.$is('Path')(narrowed.node)).toBe(true)

    const nullable = Expr.residualize(flagsOr($.maybe, 0), {}, { foreign: impls })
    expect(Node.$is('Path')(nullable.node)).toBe(true)

    // Wide number may hold 2^31, which flagsOr refuses; must stay a Call.
    const wide = Expr.residualize(flagsOr($.wide, 0), {}, { foreign: impls })
    expect(Node.$is('Call')(wide.node)).toBe(true)

    // Without implementation, stays a Call.
    const unsupported = Expr.residualize(flagsOr($.granted, 0), {})
    expect(Node.$is('Call')(unsupported.node)).toBe(true)
  })

  it('rewrites absorbing only when the dropped operand cannot refuse and is non-null', () => {
    const absorbed = Expr.residualize(flagsOr($.granted, 0x7fff_ffff), {}, { foreign: impls })
    expect(Node.$is('Lit')(absorbed.node) && absorbed.node.value === 0x7fff_ffff).toBe(true)

    // Nullable operand may be null, where strict flagsOr returns null, not 0x7fffffff.
    const nullable = Expr.residualize(flagsOr($.maybe, 0x7fff_ffff), {}, { foreign: impls })
    expect(Node.$is('Call')(nullable.node)).toBe(true)

    const judged = Expr.judge(
      Eq.is(flagsOr($.granted, 0x7fff_ffff), 0x7fff_ffff),
      {},
      { foreign: impls },
    )
    expect(Verdict.isTrue(judged)).toBe(true)

    const judgedNullable = Expr.judge(
      Eq.is(flagsOr($.maybe, 0x7fff_ffff), 0x7fff_ffff),
      {},
      { foreign: impls },
    )
    expect(Verdict.isUnknown(judgedNullable)).toBe(true)
  })

  it('rewrites binary and unary idempotent calls', () => {
    const bin = Expr.residualize(flagsOr($.granted, $.granted), {}, { foreign: impls })
    expect(Node.$is('Path')(bin.node)).toBe(true)

    const un = Expr.residualize(flagsNorm(flagsNorm($.granted)), {}, { foreign: impls })
    expect(
      Node.$is('Call')(un.node) && un.node.args.length === 1 && Node.$is('Path')(un.node.args[0]!),
    ).toBe(true)

    const judgedBin = Expr.judge(
      Eq.is(flagsOr($.granted, $.granted), $.granted),
      {},
      { foreign: impls },
    )
    expect(Verdict.isTrue(judgedBin)).toBe(true)

    const judgedIdentity = Expr.judge(
      Eq.is(flagsOr($.granted, 0), $.granted),
      {},
      { foreign: impls },
    )
    expect(Verdict.isTrue(judgedIdentity)).toBe(true)

    // Reflexive Eq.is on a foreign call stays Unknown (a call may refuse), while
    // residualizing flagsOr(flagsNorm(flagsNorm($.granted)), flagsNorm($.granted))
    // collapses both unary and binary idempotence to flagsNorm($.granted).
    const collapsed = Expr.residualize(
      flagsOr(flagsNorm(flagsNorm($.granted)), flagsNorm($.granted)),
      {},
      { foreign: impls },
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
})
