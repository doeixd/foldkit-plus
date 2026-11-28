/**
 * Unit tests for `@doeixd/metakit/fn`: hygienic nested `Rows` calls, `Inspect.fn`,
 * `Expr.residualize` / `Expr.judge`, contract error phases, and `Prove.fn`.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { Arr, Eq, Expr, Num, Path, Verdict } from '@doeixd/metakit'
import * as Fn from '@doeixd/metakit/fn'
import * as Inspect from '@doeixd/metakit/inspect'
import * as Prove from '@doeixd/metakit/prove'
import { describe, expect, it } from 'vitest'

describe('metakit/fn: hygiene, partial evaluation, inspection & contract phases', () => {
  it('hygienically alpha-renames inner Rows binders when a Fn is called inside an outer Arr fold', () => {
    const Item = Schema.Struct({ score: Schema.Int })
    const Group = Schema.Struct({
      threshold: Schema.Int,
      items: Schema.Array(Item),
    })

    const hasHighItem = Fn.make({ items: Schema.Array(Item), min: Schema.Int }, ({ items, min }) =>
      Arr.any(items, item => Num.gte(item.score, min)),
    )

    const Catalog = Schema.Struct({ groups: Schema.Array(Group) })
    const $ = Path.from(Catalog)
    const anyGroupHasHigh = Arr.any($.groups, group =>
      hasHighItem({ items: group.items, min: group.threshold }),
    )

    // Without hygienic alpha-renaming, inner `each` would collide with outer `each` (`group.threshold`)!
    expect(
      Expr.evaluate(anyGroupHasHigh, {
        groups: [
          { threshold: 100, items: [{ score: 10 }, { score: 20 }] },
          { threshold: 50, items: [{ score: 60 }] },
        ],
      }),
    ).toBe(true)

    expect(
      Expr.evaluate(anyGroupHasHigh, {
        groups: [
          { threshold: 100, items: [{ score: 10 }, { score: 20 }] },
          { threshold: 50, items: [{ score: 40 }] },
        ],
      }),
    ).toBe(false)
  })

  it('partially evaluates (residualize & judge) through Fn calls', () => {
    const isDiscounted = Fn.make({ price: Schema.Int, pct: Schema.Int }, ({ price, pct }) =>
      Expr.all(Num.gt(price, 0), Num.gt(pct, 0)),
    )

    const Env = Schema.Struct({ price: Schema.Int, pct: Schema.Int })
    const $ = Path.from(Env)
    const expr = isDiscounted({ price: $.price, pct: $.pct })

    // Guarded symbolic call checks non-nullness of `price`, so knowing only pct = 0 stays Unknown;
    // `bare` omits parameter guards and settles the conjunction to False.
    expect(Verdict.isUnknown(Expr.judge(expr, { pct: 0 }))).toBe(true)
    expect(
      Verdict.isFalse(Expr.judge(isDiscounted.bare({ price: $.price, pct: $.pct }), { pct: 0 })),
    ).toBe(true)
    // Knowing only pct = 10 leaves price > 0 undecided
    expect(Verdict.isUnknown(Expr.judge(expr, { pct: 10 }))).toBe(true)
  })

  it('reports all 5 FnContractError phases (params, where, body, returns, ensures)', () => {
    const fnReturnsBad = Fn.make({ x: Schema.Int }, ({ x }) => Num.sub(x, 10))
      .where(({ x }) => Num.gte(x, 0))
      .returns(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)))
    const retFail = fnReturnsBad.runChecked({ x: 5 })
    expect(Result.isFailure(retFail)).toBe(true)
    if (Result.isFailure(retFail)) expect(retFail.failure.phase).toBe('returns')

    const fnEnsuresBad = Fn.make({ x: Schema.Int }, ({ x }) => Num.add(x, 1)).ensures(
      ({ params, result }) => Num.lt(result, params.x),
    )
    const ensFail = fnEnsuresBad.runChecked({ x: 5 })
    expect(Result.isFailure(ensFail)).toBe(true)
    if (Result.isFailure(ensFail)) expect(ensFail.failure.phase).toBe('ensures')

    const fnBodyRefuses = Fn.make({ x: Schema.Int }, ({ x }) =>
      Num.div(x, 0, { rounding: 'floor', onZero: 'null' }),
    )
    expect(fnBodyRefuses.runChecked({ x: 5 })).toEqual(Result.succeed(null))

    const fnOverflow = Fn.make({ x: Schema.Int }, ({ x }) => Num.add(x, 1))
    const bodyFail = fnOverflow.runChecked({ x: Number.MAX_SAFE_INTEGER })
    expect(Result.isFailure(bodyFail)).toBe(true)
    if (Result.isFailure(bodyFail)) expect(bodyFail.failure.phase).toBe('body')
  })

  it('extracts parameter specs, JSON Schemas, and contract counts via Inspect.fn', () => {
    const calc = Fn.make(
      {
        amount: Schema.Int.check(Schema.isGreaterThan(0)),
        rate: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
      },
      ({ amount, rate }) => Num.mul(amount, rate),
    )
      .where(({ amount }) => Num.lte(amount, 10_000))
      .returns(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)))
      .ensures(({ result }) => Num.gte(result, 0))

    const info = Inspect.fn(calc)
    expect(info.params.map(p => p.name)).toEqual(['amount', 'rate'])
    expect(info.hasWhere).toBe(true)
    expect(info.whereCount).toBe(1)
    expect(info.hasEnsures).toBe(true)
    expect(info.ensuresCount).toBe(1)
    expect(Option.isSome(info.returns)).toBe(true)
    expect(Option.isSome(info.returnsJsonSchema)).toBe(true)
    expect(info.paramsJsonSchema['type']).toBe('object')
  })

  it('proves well-definedness even without returns or ensures, and refutes unsafe overflow in Prove.fn', async () => {
    const safeInc = Fn.make(
      { x: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })) },
      ({ x }) => Num.add(x, 1),
    )
    expect(Verdict.isTrue(await Effect.runPromise(Prove.fn(safeInc)))).toBe(true)

    const unsafeInc = Fn.make({ x: Schema.Int }, ({ x }) => Num.add(x, 1))
    // At x = MAX_SAFE_INTEGER, x + 1 overflows and refuses -> Prove.fn refutes!
    const verdict = await Effect.runPromise(Prove.fn(unsafeInc))
    expect(Verdict.isFalse(verdict)).toBe(true)
  })

  it('prevents capture of user fields named `each`, rejects symbolic Opaque substitution, and enforces Fn.iterate expansion budget (#648 #4)', () => {
    // 1. User field literally named `each` passed into a Fn containing Arr.any must NOT be captured by inner `each`!
    const Item = Schema.Struct({ score: Schema.Int })
    const hasAtLeast = Fn.make({ items: Schema.Array(Item), min: Schema.Int }, ({ items, min }) =>
      Arr.any(items, item => Num.gte(item.score, min)),
    )
    const UserEnv = Schema.Struct({
      items: Schema.Array(Item),
      each: Schema.Int,
    })
    const $u = Path.from(UserEnv)
    const expr = hasAtLeast({ items: $u.items, min: $u.each })
    expect(
      Expr.evaluate(expr, {
        items: [{ score: 5 }, { score: 20 }],
        each: 15,
      }),
    ).toBe(true)
    expect(
      Expr.evaluate(expr, {
        items: [{ score: 5 }, { score: 10 }],
        each: 15,
      }),
    ).toBe(false)

    // 2. Opaque node inside Fn works via run(), but throws loudly on symbolic substitution
    const opaqueFn = Fn.make({ x: Schema.Int }, () =>
      Expr.opaque<{ readonly x: number }, number>({ name: 'hostRandom' }, env => env.x + 1),
    )
    expect(opaqueFn.run({ x: 10 })).toBe(11)
    const Outer = Schema.Struct({ a: Schema.Int })
    const $o = Path.from(Outer)
    expect(() => opaqueFn({ x: $o.a })).toThrow(/cannot symbolically substitute Opaque node/)

    // 3. Exponential Fn.iterate (add(x, x)) fails loudly when exceeding expansion node budget
    const dbl = Fn.make({ x: Schema.Int }, ({ x }) => Num.add(x, x))
    expect(() => Fn.iterate(dbl, 15, { maxNodes: 200 })).toThrow(RangeError)
    expect(Fn.iterate(dbl, 3, { maxNodes: 200 }).run({ x: 2 })).toBe(16)

    // 4. Nested Rows inside Fn called with user field named `each` must NOT capture inner binder!
    const sharesScore = Fn.make(
      { xs: Schema.Array(Item), ys: Schema.Array(Item), min: Schema.Int },
      ({ xs, ys, min }) =>
        Arr.any(xs, x =>
          Arr.any(ys, y => Expr.all(Num.gte(x.score, min), Eq.is(x.score, y.score))),
        ),
    )
    const NestedEnv = Schema.Struct({
      xs: Schema.Array(Item),
      ys: Schema.Array(Item),
      each: Schema.Int,
    })
    const $n = Path.from(NestedEnv)
    const nestedCall = sharesScore({ xs: $n.xs, ys: $n.ys, min: $n.each })
    expect(
      Expr.evaluate(nestedCall, {
        xs: [{ score: 10 }],
        ys: [{ score: 20 }],
        each: 5,
      }),
    ).toBe(false)
    expect(
      Expr.evaluate(nestedCall, {
        xs: [{ score: 10 }, { score: 20 }],
        ys: [{ score: 20 }],
        each: 15,
      }),
    ).toBe(true)

    // 5. Fn.partial rejects Opaque body, and Fn.iterate(f, 0) keeps param Schema (not narrower returnSchema)
    const opaquePair = Fn.make({ a: Schema.Int, b: Schema.Int }, () =>
      Expr.opaque<{ readonly a: number; readonly b: number }, number>(
        { name: 'sumOpaque' },
        env => env.a + env.b,
      ),
    )
    expect(() => opaquePair.partial({ a: 1 })).toThrow(/cannot symbolically substitute Opaque node/)

    const clampZero = Fn.params({ x: Schema.Int })
      .returns(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)))
      .body(({ x }) => Expr.when(Num.gte(x, 0), { then: x, else: 0 }))
    expect(Fn.iterate(clampZero, 0).runChecked({ x: -5 })).toEqual(Result.succeed(-5))
  })
})
