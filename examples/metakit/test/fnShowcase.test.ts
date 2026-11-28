/**
 * End-to-end showcase & verification suite for `metakit/fn`, `Prove.fn`,
 * and relational `ensures` postconditions on `Transition.make`.
 */
import { PGlite } from '@electric-sql/pglite'
import { Effect, Option, Result, Schema } from 'effect'
import { Eq, Expr, Num, Path, Sets, Transition, Verdict } from 'metakit'
import { Money, OrderedEnum } from 'metakit/domain'
import * as Fn from 'metakit/fn'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'
import { describe, expect, it } from 'vitest'

const Usd = Money.make('USD')
const Pct = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))

describe('metakit/fn: callable, inspectable, Z3-verified functions', () => {
  const applyDiscount = Fn.make(
    {
      price: Usd.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
      pct: Pct,
    },
    ({ price, pct }) =>
      Num.sub(price, Num.div(Num.mul(price, pct), 100, { rounding: 'half-even' })),
  )
    .where(({ price }) => Num.gt(price, 0))
    .returns(Usd.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })))
    .ensures(({ params, result }) => Expr.all(Num.lte(result, params.price), Num.gte(result, 0)))

  it('evaluates directly via run(), validates contracts via runChecked(), and composes symbolically', () => {
    expect(applyDiscount.run({ price: Money.minor('USD', 2500), pct: 10 })).toBe(2250)
    expect(applyDiscount.runChecked({ price: 2500, pct: 10 })).toEqual(Result.succeed(2250))

    // Schema failure -> phase: 'params'
    const badParam = applyDiscount.runChecked({ price: 2500, pct: 150 })
    expect(Result.isFailure(badParam)).toBe(true)
    if (Result.isFailure(badParam)) expect(badParam.failure.phase).toBe('params')

    // Precondition failure (`price === 0` violates `where: price > 0`) -> phase: 'where'
    const badPre = applyDiscount.runChecked({ price: 0, pct: 10 })
    expect(Result.isFailure(badPre)).toBe(true)
    if (Result.isFailure(badPre)) expect(badPre.failure.phase).toBe('where')

    // Symbolic call + precondition extraction + nested Fn composition
    const Line = Schema.Struct({
      qty: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
      unitPrice: Usd.check(Schema.isBetween({ minimum: 1, maximum: 10_000 })),
    })
    const lineTotal = Fn.params({ line: Line, pct: Pct })
      .returns(Usd.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })))
      .body(({ line, pct }) => Num.mul(line.qty, applyDiscount({ price: line.unitPrice, pct })))

    const Cart = Schema.Struct({ item: Line, discount: Pct })
    const $cart = Path.from(Cart)
    const expr = lineTotal({ line: $cart.item, pct: $cart.discount })
    expect(
      Expr.evaluate(expr, {
        item: { qty: 3, unitPrice: Money.minor('USD', 1000) },
        discount: 20,
      }),
    ).toBe(2400)

    // Precondition substitution
    const pre = applyDiscount.precondition({ price: $cart.item.unitPrice, pct: $cart.discount })
    expect(
      Expr.evaluate(pre, {
        item: { qty: 1, unitPrice: Money.minor('USD', 500) },
        discount: 10,
      }),
    ).toBe(true)
  })

  it('lowers Fn calls transparently to Postgres SQL in PGlite with zero new CoreOpIds', async () => {
    const Product = Schema.Struct({
      id: Schema.String,
      price: Usd.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })),
      discountPct: Pct,
    })
    const isAffordable = Expr.in(
      { row: Product, budget: Schema.Struct({ max: Usd }) },
      ({ row, budget }) =>
        Num.lte(applyDiscount({ price: row.price, pct: row.discountPct }), budget.max),
    )

    const db = new PGlite()
    await db.exec(`
      CREATE TABLE products (id TEXT PRIMARY KEY, price INTEGER NOT NULL, "discountPct" INTEGER NOT NULL);
      INSERT INTO products VALUES ('p1', 1000, 10), ('p2', 2000, 50), ('p3', 3000, 10);
    `)
    const where = Result.getOrThrow(
      Sql.toWhere(isAffordable, {
        dialect: 'postgres',
        env: { budget: { max: Money.minor('USD', 1000) } },
      }),
    )
    const rows = await db.query<{ id: string }>(
      `SELECT id FROM products WHERE ${where.text} ORDER BY id`,
      [...where.params],
    )
    // p1: 900 <= 1000, p2: 1000 <= 1000, p3: 2700 > 1000
    expect(rows.rows).toEqual([{ id: 'p1' }, { id: 'p2' }])
    await db.close()
  })

  it('proves Hoare contracts via Prove.fn in Z3 and refutes buggy functions with witnesses', async () => {
    // 1. Valid discount function proves True in Z3
    expect(Verdict.isTrue(await Effect.runPromise(Prove.fn(applyDiscount)))).toBe(true)

    // 2. Buggy function (adds discount instead of subtracting!) -> Z3 refutes with concrete witness!
    const buggyDiscount = Fn.make(
      {
        price: Usd.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })),
        pct: Pct,
      },
      ({ price, pct }) =>
        Num.add(price, Num.div(Num.mul(price, pct), 100, { rounding: 'half-even' })),
    ).ensures(({ params, result }) => Num.lte(result, params.price))

    const refuted = await Effect.runPromise(Prove.fn(buggyDiscount))
    expect(Verdict.isFalse(refuted)).toBe(true)
    if (Verdict.isFalse(refuted)) {
      expect(Option.isSome(refuted.witness)).toBe(true)
    }

    // 3. Set-theory Fn proved in Z3: effective = roles \ denied => disjoint(effective, denied)
    const Role = Schema.Literals(['read', 'write', 'admin'])
    const effectiveRoles = Fn.make(
      { roles: Schema.Array(Role), denied: Schema.Array(Role) },
      ({ roles, denied }) => Sets.difference(roles, denied),
    ).ensures(({ params, result }) => Sets.disjoint(result, params.denied))

    expect(Verdict.isTrue(await Effect.runPromise(Prove.fn(effectiveRoles)))).toBe(true)

    // 4. OrderedEnum Fn proved in Z3
    const Stage = OrderedEnum.make(['draft', 'review', 'published'])
    const stageGap = Fn.make({ from: Stage.schema, to: Stage.schema }, ({ from, to }) =>
      Stage.distance(to, from),
    )
      .where(({ from, to }) => Stage.lte(from, to))
      .ensures(({ result }) => Num.gte(result, 0))
    expect(Verdict.isTrue(await Effect.runPromise(Prove.fn(stageGap)))).toBe(true)
  })

  it('proves and refutes stateful before/after ensures postconditions on Transition.make', async () => {
    const Account = Schema.Struct({
      balance: Usd.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
    })

    const Withdraw = Transition.make({
      state: Account,
      input: Schema.Struct({
        amount: Usd.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })),
      }),
      when: ({ state, input }) => Num.gte(state.balance, input.amount),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Money.sub(state.balance, input.amount)),
      ],
      ensures: ({ state, input, next }) =>
        Expr.all(
          Num.lt(next.balance, state.balance),
          Eq.is(next.balance, Money.sub(state.balance, input.amount)),
        ),
    })

    const M = Machine.make({ state: Account, transitions: { Withdraw } })
    const report = await Effect.runPromise(Prove.machine(M, { pin: ['Withdraw'] }))
    expect(report.ok).toBe(true)

    // Buggy ensures: claims balance strictly increased on withdraw -> Z3 refutes with witness!
    const BuggyPost = Transition.make({
      state: Account,
      input: Schema.Struct({
        amount: Usd.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })),
      }),
      when: ({ state, input }) => Num.gte(state.balance, input.amount),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Money.sub(state.balance, input.amount)),
      ],
      ensures: ({ state, next }) => Num.gt(next.balance, state.balance),
    })
    const buggyVerdict = await Effect.runPromise(Prove.transition(Account, BuggyPost))
    expect(Verdict.isFalse(buggyVerdict)).toBe(true)
    if (Verdict.isFalse(buggyVerdict)) {
      expect(Option.isSome(buggyVerdict.witness)).toBe(true)
    }
  })
})
