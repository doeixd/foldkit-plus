import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Node, Path } from '../src/index.js'
import * as Operation from '../src/operation.js'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 }))

const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    idempotent: true,
    identity: { value: 0, side: 'both' },
  },
})

const flagsXor = Operation.define({
  id: 'flags.xor',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    identity: { value: 0, side: 'both' },
    invertible: { inverse: 'self' },
  },
})

const flagsClamp = Operation.define({
  id: 'flags.clamp',
  version: 1,
  args: [Flags, Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: { monotone: ['up', 'none', 'none'] },
})

const impls = {
  'flags.or@1': { run: ([a, b]: ReadonlyArray<unknown>) => (a as number) | (b as number) },
  'flags.xor@1': { run: ([a, b]: ReadonlyArray<unknown>) => (a as number) ^ (b as number) },
  'flags.clamp@1': {
    run: ([x, lo, hi]: ReadonlyArray<unknown>) =>
      Math.min(hi as number, Math.max(lo as number, x as number)),
  },
}

describe('Operation.define (Phase 4 bout 4.4)', () => {
  it('builds a typed callable expression carrying the ForeignOp descriptor', () => {
    const State = Schema.Struct({ granted: Flags, extra: Flags })
    const $ = Path.from(State)
    const call = flagsOr($.granted, 4)
    expect(call.node._tag).toBe('Call')
    expect(flagsOr.descriptor.id).toBe('flags.or')
    expect(flagsOr.descriptor.version).toBe(1)
    expect(flagsOr.descriptor.returns).toBe('number')
    expect(flagsOr.descriptor.claims.commutative).toBe(true)
    expect(flagsOr.descriptor.claims.identity).toEqual({ value: 0, side: 'both' })

    expect(Expr.evaluate(call, { granted: 1, extra: 2 }, { foreign: impls })).toBe(5)
    expect(
      Expr.evaluate(flagsOr($.granted, $.extra), { granted: 1, extra: 2 }, { foreign: impls }),
    ).toBe(3)
    expect(
      Expr.evaluate(flagsClamp($.granted, 0, 10), { granted: 42, extra: 0 }, { foreign: impls }),
    ).toBe(10)
  })

  it('enforces argument and result Schemas at evaluation time', () => {
    const State = Schema.Struct({ x: Schema.Number })
    const $ = Path.from(State)
    const outOfRangeArg = Expr.evalResult(flagsOr($.x, 1), { x: 2147483648 }, { foreign: impls })
    expect(Result.isFailure(outOfRangeArg)).toBe(true)
    if (Result.isFailure(outOfRangeArg)) {
      expect(outOfRangeArg.failure.reason).toBe('ill-typed')
      expect(outOfRangeArg.failure.detail).toContain(
        'flags.or@1: argument 1 is 2147483648, outside its Schema (a value between 0 and 2147483647)',
      )
    }

    const badImpl = { 'flags.or@1': { run: () => -1 } }
    const outOfRangeResult = Expr.evalResult(flagsOr(1, 2), {}, { foreign: badImpl })
    expect(Result.isFailure(outOfRangeResult)).toBe(true)
    if (Result.isFailure(outOfRangeResult)) {
      expect(outOfRangeResult.failure.reason).toBe('ill-typed')
      expect(outOfRangeResult.failure.detail).toContain(
        'flags.or@1: the implementation gave -1, outside its result Schema (a value between 0 and 2147483647)',
      )
    }
  })

  it('refuses invalid declarations with exact error messages', () => {
    expect(() =>
      Operation.define({
        id: 'num.half' as never,
        version: 1,
        args: [Flags],
        returns: Flags,
        nulls: 'strict',
      }),
    ).toThrow(
      '[metakit] Operation.define: "num.half" is under the core prefix "num."; choose an id outside bool., eq., null., ord., num., str., arr., rows.',
    )

    expect(() =>
      Operation.define({
        id: 'flags.bad',
        version: 0,
        args: [Flags],
        returns: Flags,
        nulls: 'strict',
      }),
    ).toThrow(
      '[metakit] Operation.define: the version of "flags.bad" is 0; a version is a positive integer, and a changed meaning takes a new one.',
    )

    expect(() =>
      Operation.define({
        id: 'geo.near',
        version: 1,
        args: [Schema.Date],
        returns: Schema.Boolean,
        nulls: 'strict',
      }),
    ).toThrow(
      /\[metakit\] Operation\.define: argument 1 of "geo\.near" holds .*; an operation takes and gives numbers, booleans and text\./,
    )

    expect(() =>
      Operation.define({
        id: 'x.parse',
        version: 1,
        args: [Schema.NumberFromString],
        returns: Schema.Number,
        nulls: 'strict',
      }),
    ).toThrow(
      /\[metakit\] Operation\.define: argument 1 of "x\.parse" decodes from another form \(.*\); declare the Schema of the value as stored, such as Schema\.Number\./,
    )

    expect(() =>
      Operation.define({
        id: 'flags.badId',
        version: 1,
        args: [Flags, Flags],
        returns: Flags,
        nulls: 'strict',
        claims: { identity: { value: -1, side: 'both' } },
      }),
    ).toThrow(
      '[metakit] Operation.define: the identity of "flags.badId" is -1, which its argument Schema does not admit (a value between 0 and 2147483647).',
    )

    expect(() =>
      Operation.define({
        id: 'flags.badAbs',
        version: 1,
        args: [Flags, Flags],
        returns: Flags,
        nulls: 'strict',
        claims: { absorbing: { value: -1, result: 0, side: 'both' } },
      }),
    ).toThrow(
      '[metakit] Operation.define: the absorbing value of "flags.badAbs" is -1, which its argument Schema does not admit (a value between 0 and 2147483647).',
    )
  })

  it('describes and compares operations across boundaries', () => {
    const descA = Operation.describe(flagsOr)
    const descB = Operation.describe(flagsOr)
    expect(Operation.compare(descA, descB)).toEqual(Option.none())

    const changedClaims = Operation.describe(
      Operation.define({
        id: 'flags.or',
        version: 1,
        args: [Flags, Flags],
        returns: Flags,
        nulls: 'strict',
        claims: { commutative: true },
      }),
    )
    expect(Operation.compare(descA, changedClaims)).toEqual(Option.some('claims differ'))

    const descXor = Operation.describe(flagsXor)
    expect(descXor.claims.invertible).toEqual({ inverse: 'self' })
    expect(Node.foreignName(flagsXor.descriptor)).toBe('flags.xor@1')
  })
})
