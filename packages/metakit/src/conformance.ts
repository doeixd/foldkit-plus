/**
 * Conformance & Galois soundness property testing (`metakit/conformance`).
 *
 * Uses Effect's `Arbitrary.schema` to sample concrete inputs inside abstract
 * intervals and verify Galois soundness for BOTH `forward` AND `narrow`
 * transformers in `abstractOps`:
 *   - Forward:  ∀ x ∈ γ(a), f(x) ∈ γ(f#(a))
 *   - Backward: ∀ x ∈ γ(a), f(x) ∈ γ(target) ==> x ∈ γ(narrow(a, target))
 */
import { Arbitrary, Effect, Equal, Schema } from 'effect'
import { abstractOps } from './abstract/check.js'
import * as Interval from './abstract/interval.js'
import * as Expr from './expr.js'
import * as Num from './ops/num.js'
import * as Ord from './ops/ord.js'
import * as Verdict from './verdict.js'

export interface GaloisFailure {
  readonly op: string
  readonly inputs: ReadonlyArray<number>
  readonly intervals: ReadonlyArray<Interval.Interval>
  readonly concrete: unknown
  readonly abstract: unknown
}

export interface GaloisReport {
  readonly ok: boolean
  readonly checked: number
  readonly failures: ReadonlyArray<GaloisFailure>
}

export interface GaloisOptions {
  readonly samples?: number
}

const sampleNumbers = (schema: Schema.Codec<number>, count: number): ReadonlyArray<number> => {
  const arb = Arbitrary.schema(schema)
  const raw = Effect.runSync(Arbitrary.sampleEffect(arb, { count }))
  return raw.filter(n => Number.isFinite(n))
}

const makeIntervals = (values: ReadonlyArray<number>): ReadonlyArray<Interval.Interval> => {
  const out: Array<Interval.Interval> = []
  for (let i = 0; i + 1 < values.length; i += 2) {
    const a = values[i]!
    const b = values[i + 1]!
    out.push(Interval.between(Math.min(a, b), Math.max(a, b)))
  }
  return out
}

const pickInside = (iv: Interval.Interval, pool: ReadonlyArray<number>): ReadonlyArray<number> => {
  const points: Array<number> = [iv.lo, iv.hi]
  const mid = (iv.lo + iv.hi) / 2
  if (Number.isFinite(mid) && Interval.contains(iv, mid)) points.push(mid)
  const floored = Math.floor(mid)
  if (Number.isFinite(floored) && Interval.contains(iv, floored)) points.push(floored)
  for (const v of pool) {
    if (Interval.contains(iv, v)) {
      points.push(v)
      if (points.length >= 8) break
    }
  }
  return points
}

/** Property-test forward Galois soundness of a binary numeric transformer. */
export const galoisBinary = (
  name: string,
  concrete: (a: number, b: number) => number,
  abstract: (a: Interval.Interval, b: Interval.Interval) => Interval.Interval,
  leftSchema: Schema.Codec<number>,
  rightSchema: Schema.Codec<number>,
  options?: GaloisOptions,
): GaloisReport => {
  const count = options?.samples ?? 40
  const leftPool = sampleNumbers(leftSchema, count)
  const rightPool = sampleNumbers(rightSchema, count)
  const leftIvs = makeIntervals(leftPool)
  const rightIvs = makeIntervals(rightPool)
  const failures: Array<GaloisFailure> = []
  let checked = 0

  for (const a of leftIvs) {
    const xs = pickInside(a, leftPool)
    for (const b of rightIvs) {
      const ys = pickInside(b, rightPool)
      const outIv = abstract(a, b)
      for (const x of xs) {
        for (const y of ys) {
          const val = concrete(x, y)
          if (!Number.isFinite(val)) continue
          checked++
          if (!Interval.contains(outIv, val)) {
            failures.push({
              op: name,
              inputs: [x, y],
              intervals: [a, b],
              concrete: val,
              abstract: outIv,
            })
            if (failures.length >= 5) return { ok: false, checked, failures }
          }
        }
      }
    }
  }
  return { ok: failures.length === 0, checked, failures }
}

/** Property-test forward Galois soundness of a unary numeric transformer. */
export const galoisUnary = (
  name: string,
  concrete: (a: number) => number,
  abstract: (a: Interval.Interval) => Interval.Interval,
  schema: Schema.Codec<number>,
  options?: GaloisOptions,
): GaloisReport => {
  const count = options?.samples ?? 60
  const pool = sampleNumbers(schema, count)
  const ivs = makeIntervals(pool)
  const failures: Array<GaloisFailure> = []
  let checked = 0

  for (const a of ivs) {
    const xs = pickInside(a, pool)
    const outIv = abstract(a)
    for (const x of xs) {
      const val = concrete(x)
      if (!Number.isFinite(val)) continue
      checked++
      if (!Interval.contains(outIv, val)) {
        failures.push({
          op: name,
          inputs: [x],
          intervals: [a],
          concrete: val,
          abstract: outIv,
        })
        if (failures.length >= 5) return { ok: false, checked, failures }
      }
    }
  }
  return { ok: failures.length === 0, checked, failures }
}

/**
 * Property-test backward narrowing soundness of a binary numeric transformer:
 *   ∀ x ∈ a, y ∈ b: concrete(x, y) ∈ target ==> x ∈ a' ∧ y ∈ b'.
 */
export const galoisNarrowBinary = (
  name: string,
  concrete: (a: number, b: number) => number,
  narrow: (
    args: ReadonlyArray<Interval.Interval>,
    target: Interval.Interval,
  ) => ReadonlyArray<Interval.Interval>,
  schema: Schema.Codec<number>,
  options?: GaloisOptions,
): GaloisReport => {
  const count = options?.samples ?? 30
  const pool = sampleNumbers(schema, count)
  const ivs = makeIntervals(pool)
  const failures: Array<GaloisFailure> = []
  let checked = 0

  for (const a of ivs.slice(0, 6)) {
    const xs = pickInside(a, pool)
    for (const b of ivs.slice(0, 6)) {
      const ys = pickInside(b, pool)
      for (const target of ivs.slice(0, 6)) {
        const [na, nb] = narrow([a, b], target)
        for (const x of xs) {
          for (const y of ys) {
            const val = concrete(x, y)
            if (!Number.isFinite(val) || !Interval.contains(target, val)) continue
            checked++
            if (!Interval.contains(na!, x) || !Interval.contains(nb!, y)) {
              failures.push({
                op: name,
                inputs: [x, y],
                intervals: [a, b, target],
                concrete: val,
                abstract: [na, nb],
              })
              if (failures.length >= 5) return { ok: false, checked, failures }
            }
          }
        }
      }
    }
  }
  return { ok: failures.length === 0, checked, failures }
}

/**
 * Property-test backward narrowing soundness of a unary numeric transformer:
 *   ∀ x ∈ a: concrete(x) ∈ target ==> x ∈ a'.
 */
export const galoisNarrowUnary = (
  name: string,
  concrete: (a: number) => number,
  narrow: (
    args: ReadonlyArray<Interval.Interval>,
    target: Interval.Interval,
  ) => ReadonlyArray<Interval.Interval>,
  schema: Schema.Codec<number>,
  options?: GaloisOptions,
): GaloisReport => {
  const count = options?.samples ?? 40
  const pool = sampleNumbers(schema, count)
  const ivs = makeIntervals(pool)
  const failures: Array<GaloisFailure> = []
  let checked = 0

  for (const a of ivs.slice(0, 10)) {
    const xs = pickInside(a, pool)
    for (const target of ivs.slice(0, 10)) {
      const [na] = narrow([a], target)
      for (const x of xs) {
        const val = concrete(x)
        if (!Number.isFinite(val) || !Interval.contains(target, val)) continue
        checked++
        if (!Interval.contains(na!, x)) {
          failures.push({
            op: name,
            inputs: [x],
            intervals: [a, target],
            concrete: val,
            abstract: [na],
          })
          if (failures.length >= 5) return { ok: false, checked, failures }
        }
      }
    }
  }
  return { ok: failures.length === 0, checked, failures }
}

/**
 * Property-test backward narrowing soundness of a binary comparison:
 *   ∀ x ∈ a, y ∈ b: concrete(x, y) === true ==> x ∈ a' ∧ y ∈ b'.
 */
export const galoisNarrowCompare = (
  name: string,
  concrete: (a: number, b: number) => boolean,
  narrow: (
    args: ReadonlyArray<Interval.Interval>,
    target: Interval.Interval,
  ) => ReadonlyArray<Interval.Interval>,
  schema: Schema.Codec<number>,
  options?: GaloisOptions,
): GaloisReport => {
  const count = options?.samples ?? 40
  const pool = sampleNumbers(schema, count)
  const ivs = makeIntervals(pool)
  const failures: Array<GaloisFailure> = []
  let checked = 0

  for (const a of ivs) {
    const xs = pickInside(a, pool)
    for (const b of ivs) {
      const ys = pickInside(b, pool)
      const [na, nb] = narrow([a, b], Interval.top)
      for (const x of xs) {
        for (const y of ys) {
          if (!concrete(x, y)) continue
          checked++
          if (!Interval.contains(na!, x) || !Interval.contains(nb!, y)) {
            failures.push({
              op: name,
              inputs: [x, y],
              intervals: [a, b],
              concrete: true,
              abstract: [na, nb],
            })
            if (failures.length >= 5) return { ok: false, checked, failures }
          }
        }
      }
    }
  }
  return { ok: failures.length === 0, checked, failures }
}

/**
 * Property-test Tier 2 partial evaluation soundness against Tier 1 evaluation:
 *   ∀ env ~ schema:
 *     eval(residualize(expr, mask(env)), env) === eval(expr, env)
 * and for boolean expressions, if `judge` returns True/False it matches `eval`.
 */
export const checkResidualizeSoundness = <S extends Schema.Top, A>(
  expr: Expr.Expr<S['Type'], A>,
  schema: S,
  mask: (env: S['Type']) => Expr.PartialEnv<S['Type']>,
  options?: GaloisOptions,
): {
  readonly ok: boolean
  readonly checked: number
  readonly mismatch?: { readonly env: S['Type']; readonly full: A; readonly residual: A }
} => {
  const arb = Arbitrary.schema(schema as unknown as Schema.Codec<S['Type']>)
  const envs = Effect.runSync(Arbitrary.sampleEffect(arb, { count: options?.samples ?? 60 }))
  let checked = 0
  for (const env of envs) {
    const partial = mask(env)
    const full = Expr.eval(expr, env)
    const residual = Expr.eval(Expr.residualize(expr, partial), env)
    checked++
    if (!Object.is(full, residual) && !Equal.equals(full, residual)) {
      return { ok: false, checked, mismatch: { env, full, residual } }
    }
    if (typeof full === 'boolean') {
      const v = Expr.judge(expr as unknown as Expr.Expr<S['Type'], boolean>, partial)
      if ((Verdict.isTrue(v) && !full) || (Verdict.isFalse(v) && full)) {
        return { ok: false, checked, mismatch: { env, full, residual } }
      }
    }
  }
  return { ok: true, checked }
}

/** Property-test Galois soundness of a binary comparison transformer. */
export const galoisCompare = (
  name: string,
  concrete: (a: number, b: number) => boolean,
  abstract: (a: Interval.Interval, b: Interval.Interval) => Verdict.Verdict<never>,
  leftSchema: Schema.Codec<number>,
  rightSchema: Schema.Codec<number>,
  options?: GaloisOptions,
): GaloisReport => {
  const count = options?.samples ?? 40
  const leftPool = sampleNumbers(leftSchema, count)
  const rightPool = sampleNumbers(rightSchema, count)
  const leftIvs = makeIntervals(leftPool)
  const rightIvs = makeIntervals(rightPool)
  const failures: Array<GaloisFailure> = []
  let checked = 0

  for (const a of leftIvs) {
    const xs = pickInside(a, leftPool)
    for (const b of rightIvs) {
      const ys = pickInside(b, rightPool)
      const verdict = abstract(a, b)
      for (const x of xs) {
        for (const y of ys) {
          const val = concrete(x, y)
          checked++
          if ((Verdict.isTrue(verdict) && !val) || (Verdict.isFalse(verdict) && val)) {
            failures.push({
              op: name,
              inputs: [x, y],
              intervals: [a, b],
              concrete: val,
              abstract: verdict,
            })
            if (failures.length >= 5) return { ok: false, checked, failures }
          }
        }
      }
    }
  }
  return { ok: failures.length === 0, checked, failures }
}

/** Run forward + backward Galois soundness checks over every Tier 3 primitive in `abstractOps`. */
export const checkAllIntervalTransformers = (
  options?: GaloisOptions,
): ReadonlyArray<GaloisReport & { readonly op: string }> => {
  const BoundedInt = Schema.Int.check(Schema.isBetween({ minimum: -500, maximum: 500 }))
  const BoundedNum = Schema.Finite.check(Schema.isBetween({ minimum: -500, maximum: 500 }))

  const binaryOps: ReadonlyArray<
    readonly [
      string,
      (a: number, b: number) => number,
      (a: Interval.Interval, b: Interval.Interval) => Interval.Interval,
      (
        args: ReadonlyArray<Interval.Interval>,
        target: Interval.Interval,
      ) => ReadonlyArray<Interval.Interval>,
    ]
  > = [
    [
      'num.add',
      (a, b) => Num.addOp.evaluate([a, b]) as number,
      (a, b) => abstractOps['num.add'].forward!([a, b]),
      abstractOps['num.add'].narrow!,
    ],
    [
      'num.sub',
      (a, b) => Num.subOp.evaluate([a, b]) as number,
      (a, b) => abstractOps['num.sub'].forward!([a, b]),
      abstractOps['num.sub'].narrow!,
    ],
    [
      'num.mul',
      (a, b) => Num.mulOp.evaluate([a, b]) as number,
      (a, b) => abstractOps['num.mul'].forward!([a, b]),
      abstractOps['num.mul'].narrow!,
    ],
  ]

  const cmpOps: ReadonlyArray<
    readonly [
      string,
      (a: number, b: number) => boolean,
      (a: Interval.Interval, b: Interval.Interval) => Verdict.Verdict<never>,
    ]
  > = [
    [
      'ord.lt',
      (a, b) => Ord.ltOp.evaluate([a, b]) as boolean,
      (a, b) => abstractOps['ord.lt'].compare!([a, b]),
    ],
    [
      'ord.lte',
      (a, b) => Ord.lteOp.evaluate([a, b]) as boolean,
      (a, b) => abstractOps['ord.lte'].compare!([a, b]),
    ],
    [
      'ord.gt',
      (a, b) => Ord.gtOp.evaluate([a, b]) as boolean,
      (a, b) => abstractOps['ord.gt'].compare!([a, b]),
    ],
    [
      'ord.gte',
      (a, b) => Ord.gteOp.evaluate([a, b]) as boolean,
      (a, b) => abstractOps['ord.gte'].compare!([a, b]),
    ],
    ['eq.is', (a, b) => a === b, (a, b) => abstractOps['eq.is'].compare!([a, b])],
    ['eq.isNot', (a, b) => a !== b, (a, b) => abstractOps['eq.isNot'].compare!([a, b])],
  ]

  return [
    ...binaryOps.map(([op, c, f]) => ({
      op: `${op}:forward:int`,
      ...galoisBinary(`${op}:forward:int`, c, f, BoundedInt, BoundedInt, options),
    })),
    ...binaryOps.map(([op, c, f]) => ({
      op: `${op}:forward:finite`,
      ...galoisBinary(`${op}:forward:finite`, c, f, BoundedNum, BoundedNum, options),
    })),
    ...binaryOps.map(([op, c, , n]) => ({
      op: `${op}:narrow:int`,
      ...galoisNarrowBinary(`${op}:narrow:int`, c, n, BoundedInt, options),
    })),
    {
      op: 'num.neg:forward',
      ...galoisUnary(
        'num.neg:forward',
        a => Num.negOp.evaluate([a]) as number,
        a => abstractOps['num.neg'].forward!([a]),
        BoundedNum,
        options,
      ),
    },
    {
      op: 'num.neg:narrow',
      ...galoisNarrowUnary(
        'num.neg:narrow',
        a => Num.negOp.evaluate([a]) as number,
        abstractOps['num.neg'].narrow!,
        BoundedInt,
        options,
      ),
    },
    ...cmpOps.map(([op, c, cmp]) => ({
      op,
      ...galoisCompare(op, c, cmp, BoundedInt, BoundedInt, options),
    })),
    {
      op: 'ord.lte:narrow',
      ...galoisNarrowCompare(
        'ord.lte:narrow',
        (a, b) => Ord.lteOp.evaluate([a, b]) as boolean,
        abstractOps['ord.lte'].narrow!,
        BoundedInt,
        options,
      ),
    },
    {
      op: 'ord.gte:narrow',
      ...galoisNarrowCompare(
        'ord.gte:narrow',
        (a, b) => Ord.gteOp.evaluate([a, b]) as boolean,
        abstractOps['ord.gte'].narrow!,
        BoundedInt,
        options,
      ),
    },
    {
      op: 'eq.is:narrow',
      ...galoisNarrowCompare(
        'eq.is:narrow',
        (a, b) => a === b,
        abstractOps['eq.is'].narrow!,
        BoundedInt,
        options,
      ),
    },
  ]
}
