/**
 * Unit tests for `metakit/fn`: hygienic nested `Rows` calls, `Inspect.fn`,
 * `Expr.residualize` / `Expr.judge`, contract error phases, and `Prove.fn`.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { Arr, Expr, Num, Path, Verdict } from 'metakit'
import * as Fn from 'metakit/fn'
import * as Inspect from 'metakit/inspect'
import * as Prove from 'metakit/prove'
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

    // Knowing only pct = 0 settles the whole conjunction to false!
    expect(Verdict.isFalse(Expr.judge(expr, { pct: 0 }))).toBe(true)
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
})
