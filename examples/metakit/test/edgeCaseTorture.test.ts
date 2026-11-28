/**
 * Bug-Hunting Sweep 4: Soundness & adversarial edge-case torture suite.
 *
 * Probes:
 * - Prototype-pollution / Object.prototype property names (`constructor`, `toString`, `__proto__`)
 * - Safe-integer overflow soundness in `Abstract.checkInvariant` & `Prove.invariant`
 * - `NaN` / `Infinity` soundness on `Schema.Number` vs `Schema.Finite`
 * - Nested `Rows` with null inner lists, empty lists, and `Arr.min`/`max`/`sum`/`find`/`keep`
 * - `Inspect.toJsonSchema` & `Expr.rulesOf` on `Schema.Option`, `Schema.optional(Schema.NullOr(...))`
 */
import { Effect, Option, Result, Schema } from 'effect'
import { Abstract, Arr, Bool, Eq, Expr, Null, Num, Path, Str, Verdict } from '@doeixd/metakit'
import { Text } from '@doeixd/metakit/domain'
import * as Inspect from '@doeixd/metakit/inspect'
import * as Prove from '@doeixd/metakit/prove'
import { describe, expect, it } from 'vitest'

describe('Bug-Hunting Sweep 4: Soundness & adversarial edge cases', () => {
  it('never reads Object.prototype properties for missing fields named constructor/toString/valueOf', () => {
    const Obj = Schema.Struct({
      constructor: Schema.optional(Schema.String),
      toString: Schema.optional(Schema.String),
      valueOf: Schema.optional(Schema.Int),
    })
    const rule = Expr.in({ row: Obj }, ({ row }) =>
      Expr.all(Null.isNull(row.constructor), Null.isNull(row.toString), Null.isNull(row.valueOf)),
    )
    const empty = {} as typeof Obj.Type
    expect(Expr.holds(rule, { row: empty })).toBe(true)
    expect(Path.get(Path.from(Obj).toString, empty)).toEqual(Option.none())
  })

  it('refuses to prove x + 1 > x on unbounded Schema.Int (overflows at MAX_SAFE_INTEGER)', async () => {
    const Unbounded = Schema.Struct({ x: Schema.Int })
    const $ = Path.from(Unbounded)
    const goal = Num.gt(Num.add($.x, 1), $.x)

    // Tier 3 must NOT falsely say True
    expect(Verdict.isTrue(Abstract.checkInvariant(Unbounded, goal))).toBe(false)
    // Tier 4 Z3 must REFUTE it (at x = MAX_SAFE_INTEGER, x + 1 is refused!)
    const proof = await Effect.runPromise(Prove.invariant(Unbounded, goal))
    expect(Verdict.isFalse(proof)).toBe(true)

    // On bounded Schema.Int (<= 1_000_000), it IS provably True
    const Bounded = Schema.Struct({
      x: Schema.Int.check(Schema.isBetween({ minimum: -1_000_000, maximum: 1_000_000 })),
    })
    const $b = Path.from(Bounded)
    expect(Verdict.isTrue(Abstract.checkInvariant(Bounded, Num.gt(Num.add($b.x, 1), $b.x)))).toBe(
      true,
    )
  })

  it('refuses to prove equality/order on plain Schema.String (NUL) and Schema.Number (NaN)', async () => {
    const RawNum = Schema.Struct({ x: Schema.Number })
    const $n = Path.from(RawNum)
    expect(Verdict.isTrue(Abstract.checkInvariant(RawNum, Eq.is($n.x, $n.x)))).toBe(false)

    const RawStr = Schema.Struct({ s: Schema.String })
    const $s = Path.from(RawStr)
    expect(Verdict.isTrue(Abstract.checkInvariant(RawStr, Eq.is($s.s, $s.s)))).toBe(false)

    const SafeStr = Schema.Struct({ s: Text.schema })
    const $t = Path.from(SafeStr)
    const proof = await Effect.runPromise(Prove.invariant(SafeStr, Eq.is($t.s, $t.s)))
    expect(Verdict.isTrue(proof)).toBe(true)
  })

  it('handles null inner lists, empty lists, and multi-fold combinations in nested Rows', () => {
    const Nested = Schema.Struct({
      groups: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          scores: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.Int))),
        }),
      ),
    })

    // Sum of inner scores per group, then sum across groups
    const totalScore = Expr.in({ n: Nested }, ({ n }) =>
      Arr.sum(n.groups, g => Arr.sum(g.scores, s => s)),
    )
    expect(
      Expr.eval(totalScore, {
        n: {
          groups: [
            { id: 'g1', scores: [10, null, 20] },
            { id: 'g2', scores: null },
            { id: 'g3', scores: [] },
            { id: 'g4', scores: [5] },
          ],
        },
      }),
    ).toBe(35)

    // Nested Arr.find inside Arr.keep
    const nonZeroGroups = Expr.in({ n: Nested }, ({ n }) =>
      Arr.keep(n.groups, g => Null.isNotNull(Arr.find(g.scores, s => Num.gt(s, 0)))),
    )
    const kept = Expr.eval(nonZeroGroups, {
      n: {
        groups: [
          { id: 'g1', scores: [0, -5] },
          { id: 'g2', scores: null },
          { id: 'g3', scores: [null, 7] },
        ],
      },
    })
    expect(kept.map(g => g.id)).toEqual(['g3'])
  })

  it('handles Schema.optional(Schema.NullOr(...)) in rulesOf, Inspect, and eval', () => {
    const NonEmpty = Text.schema
      .annotate({ title: 'Bio', description: 'Short bio' })
      .pipe(Expr.refine($ => Num.gt(Str.len($), 0), { message: 'bio cannot be empty' }))
    const Profile = Schema.Struct({
      bio: Schema.optional(Schema.NullOr(NonEmpty)),
      age: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 150 }))),
    })
    const rules = Expr.rulesOf(Profile)
    expect(rules.length).toBe(3)
    for (const r of rules) {
      expect(Expr.holds(r.expr, { age: null })).toBe(true)
      expect(Expr.holds(r.expr, { bio: null, age: null })).toBe(true)
      expect(Expr.holds(r.expr, { bio: undefined, age: 25 })).toBe(true)
    }
    expect(Expr.holds(rules[0]!.expr, { bio: '', age: 25 })).toBe(false)

    const [bioSpec, ageSpec] = Inspect.fieldSpecs(Profile)
    expect(bioSpec?.optional).toBe(true)
    expect(bioSpec?.nullable).toBe(true)
    expect(bioSpec?.title).toEqual(Option.some('Bio'))
    expect(ageSpec?.min).toEqual(Option.some(0))
    expect(ageSpec?.max).toEqual(Option.some(150))

    // Verify Result.isFailure on refusal (NUL in Str.len)
    const res = Expr.evalResult(
      Expr.in({ s: Schema.String }, ({ s }) => Str.len(s)),
      { s: 'bad\u0000text' },
    )
    expect(Result.isFailure(res)).toBe(true)
    expect(Expr.eval(Bool.and(true, false), {})).toBe(false)
  })
})
