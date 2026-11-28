/** `z3-solver` is an optional peer: without it a proof that needs it fails with a typed error, once. */
import { Effect, Result, Schema } from 'effect'
import { expect, it, vi } from 'vitest'
import { Abstract, Expr, Num, Path, Verdict } from '@doeixd/metakit'
import * as Prove from '@doeixd/metakit/prove'

const Ledger = Schema.Struct({ a: Schema.Int, b: Schema.Int, c: Schema.Int }).pipe(
  Expr.refine($ =>
    Expr.all(
      Num.gte($.a, 0),
      Num.gte($.b, 0),
      Num.lte(Num.add($.a, $.b), $.c),
      Num.lte($.c, 1_000),
    ),
  ),
)
const $ = Path.forSchema(Ledger)
const doubled = Num.lte(Num.add(Num.mul(2, $.a), Num.mul(2, $.b)), Num.mul(2, $.c))
const decided = Num.gte($.a, 0)

it('fails with SolverUnavailableError where the solver is needed, and tries again on the next proof', async () => {
  // The synchronous checks decide the second goal and leave the first to the solver.
  expect(Verdict.isTrue(Abstract.checkInvariant(Ledger, doubled))).toBe(false)
  expect(Verdict.isTrue(Abstract.checkInvariant(Ledger, decided))).toBe(true)

  vi.doMock('z3-solver', () => {
    throw new Error('Cannot find package z3-solver')
  })
  const failed = await Effect.runPromise(Effect.result(Prove.invariant(Ledger, doubled)))
  expect(Result.isFailure(failed) && failed.failure._tag).toBe('SolverUnavailableError')
  // A goal the synchronous checks prove never asks for it.
  expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Ledger, decided)))).toBe(true)

  vi.doUnmock('z3-solver')
  expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Ledger, doubled)))).toBe(true)
}, 30_000)
