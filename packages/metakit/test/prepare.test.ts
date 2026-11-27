import { Effect, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Arr, Bool, Eq, Expr, Node, Null, Num, Ord, Str } from '../src/index.js'
import * as Interpreter from '../src/interpreter.js'
import * as Language from '../src/language.js'
import * as Operation from '../src/operation.js'
import { evalNode } from '../src/ops/eval.js'

const Account = Schema.Struct({
  balance: Schema.Int,
  reserved: Schema.Int,
  tier: Schema.Literals(['free', 'pro', 'enterprise']),
  note: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
})

const Scale = Operation.define({
  id: 'math.scale',
  version: 1,
  args: [Schema.Int, Schema.Int] as const,
  returns: Schema.Int,
  nulls: 'strict',
})

const MathLang = Language.make({ math: { scale: Scale } })
const mathImpls = MathLang.implement('math-js', {
  math: { scale: (a, b) => a * b },
})

describe('Interpreter.prepare (#645 P2)', () => {
  it('matches evalNode identically across scalars, paths, If, Match, nulls, refusals, and foreign ops', async () => {
    const expr = Expr.in({ acc: Account }, ({ acc }) =>
      Expr.when(Bool.and(Ord.gte(acc.balance, acc.reserved), Bool.not(Null.isNull(acc.note))), {
        then: Expr.matchOrElse(
          acc.tier,
          {
            free: Scale(Num.sub(acc.balance, acc.reserved), 1),
            pro: Scale(Num.sub(acc.balance, acc.reserved), 2),
          },
          Scale(Num.sub(acc.balance, acc.reserved), 3),
        ),
        else: Num.neg(Str.len(Null.coalesce(acc.note, ''))),
      }),
    )

    const plan = await Effect.runPromise(
      Interpreter.prepare(expr, {
        foreignIdentities: { 'math.scale@1': Option.some('js-v1') },
      }).pipe(Effect.provide(Interpreter.withForeign(mathImpls))),
    )

    expect(plan.portable).toBe(true)
    expect(plan.strategy).toBe('compiled')
    expect(Option.isSome(plan.fingerprint)).toBe(true)
    expect(Option.isSome(plan.evidenceKey)).toBe(true)

    const cases = [
      { acc: { balance: 100, reserved: 20, tier: 'free' as const, note: 'ok', tags: [] } },
      { acc: { balance: 100, reserved: 20, tier: 'pro' as const, note: 'ok', tags: [] } },
      { acc: { balance: 100, reserved: 20, tier: 'enterprise' as const, note: 'ok', tags: [] } },
      { acc: { balance: 10, reserved: 50, tier: 'pro' as const, note: 'short', tags: [] } },
      { acc: { balance: 100, reserved: 20, tier: 'pro' as const, note: null, tags: [] } },
      // Safe-integer overflow refusal must match reference eval identically
      {
        acc: {
          balance: Number.MAX_SAFE_INTEGER,
          reserved: 0,
          tier: 'pro' as const,
          note: 'overflow',
          tags: [],
        },
      },
      // NUL byte refusal in text must match reference eval identically
      { acc: { balance: 10, reserved: 50, tier: 'free' as const, note: 'a\u0000b', tags: [] } },
    ]

    for (const env of cases) {
      const ref = evalNode(expr.node, env, mathImpls)
      const got = plan.evaluateSync(env)
      if (Node.isRefusal(ref)) {
        expect(Node.isRefusal(got)).toBe(true)
        if (Node.isRefusal(got)) expect(got.reason).toBe(ref.reason)
        const effErr = await Effect.runPromise(Effect.flip(plan.evaluate(env)))
        expect(effErr.reason).toBe(ref.reason)
      } else {
        expect(got).toEqual(ref)
        expect(await Effect.runPromise(plan.evaluate(env))).toEqual(ref)
      }
    }
  })

  it('uses hybrid strategy for Rows and Opaque and drops evidenceKey when foreign identity is none', async () => {
    const rowsExpr = Expr.in({ acc: Account }, ({ acc }) =>
      Arr.any(acc.tags, tag => Eq.is(tag, 'vip')),
    )
    const rowsPlan = await Effect.runPromise(Interpreter.prepare(rowsExpr))
    expect(rowsPlan.strategy).toBe('hybrid')
    expect(rowsPlan.portable).toBe(true)
    expect(
      rowsPlan.evaluateSync({
        acc: { balance: 0, reserved: 0, tier: 'free', note: null, tags: ['a', 'vip'] },
      }),
    ).toBe(true)

    const opaqueExpr = Expr.opaque({ name: 'host' }, () => 42)
    const opaquePlan = await Effect.runPromise(Interpreter.prepare(opaqueExpr))
    expect(opaquePlan.strategy).toBe('hybrid')
    expect(opaquePlan.portable).toBe(false)
    expect(Option.isNone(opaquePlan.fingerprint)).toBe(true)
    expect(Option.isNone(opaquePlan.evidenceKey)).toBe(true)
    expect(opaquePlan.evaluateSync({} as never)).toBe(42)

    const anonPlan = await Effect.runPromise(
      Interpreter.prepare(rowsExpr, {
        foreignIdentities: { 'math.scale@1': Option.none() },
      }),
    )
    expect(Option.isSome(anonPlan.fingerprint)).toBe(true)
    expect(Option.isNone(anonPlan.evidenceKey)).toBe(true)
  })

  it('handles unmatched Match without otherwise by returning unmatched Refusal', async () => {
    const expr = Expr.in({ acc: Account }, ({ acc }) =>
      Expr.match(acc.tier, { free: 1, pro: 2, enterprise: 3 }),
    )
    const plan = await Effect.runPromise(Interpreter.prepare(expr))
    const bad = plan.evaluateSync({
      acc: { balance: 0, reserved: 0, tier: 'unknown' as never, note: null, tags: [] },
    })
    expect(Node.isRefusal(bad)).toBe(true)
    if (Node.isRefusal(bad)) expect(bad.reason).toBe('unmatched')
  })
})
