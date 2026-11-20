/**
 * Conformance & Galois soundness property testing (`metakit/conformance`).
 *
 * Uses Effect's `Arbitrary.schema` to sample concrete inputs inside abstract
 * intervals and verify Galois soundness:
 *   ∀ x ∈ γ(a), f(x) ∈ γ(f#(a))
 * for every Tier 3 numeric and comparison transformer.
 */
import { Arbitrary, Effect, Schema } from 'effect'
import * as Interval from './abstract/interval.js'
import * as Num from './ops/num.js'
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

/**
 * Property-test Galois soundness of a binary numeric transformer:
 *   ∀ x ∈ a, y ∈ b => concrete(x, y) ∈ abstract(a, b).
 */
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

/**
 * Property-test Galois soundness of a unary numeric transformer:
 *   ∀ x ∈ a => concrete(x) ∈ abstract(a).
 */
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
 * Property-test Galois soundness of a binary comparison transformer returning
 * a Kleene $K_3$ `Verdict`:
 *   - if `abstract(a, b)` is `True`, every `(x, y) ∈ a × b` MUST yield `true`;
 *   - if `abstract(a, b)` is `False`, every `(x, y) ∈ a × b` MUST yield `false`.
 */
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
          if (Verdict.isTrue(verdict) && !val) {
            failures.push({
              op: name,
              inputs: [x, y],
              intervals: [a, b],
              concrete: val,
              abstract: verdict,
            })
          } else if (Verdict.isFalse(verdict) && val) {
            failures.push({
              op: name,
              inputs: [x, y],
              intervals: [a, b],
              concrete: val,
              abstract: verdict,
            })
          }
          if (failures.length >= 5) return { ok: false, checked, failures }
        }
      }
    }
  }
  return { ok: failures.length === 0, checked, failures }
}

/** Run Galois soundness checks over every built-in Tier 3 Interval transformer. */
export const checkAllIntervalTransformers = (
  options?: GaloisOptions,
): ReadonlyArray<GaloisReport & { readonly op: string }> => {
  const BoundedInt = Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))
  const BoundedNum = Schema.Finite.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))

  const binaryOps: ReadonlyArray<
    readonly [
      string,
      (a: number, b: number) => number,
      (a: Interval.Interval, b: Interval.Interval) => Interval.Interval,
    ]
  > = [
    ['add', (a, b) => Num.addOp.evaluate([a, b]) as number, Interval.add],
    ['sub', (a, b) => Num.subOp.evaluate([a, b]) as number, Interval.sub],
    ['mul', (a, b) => Num.mulOp.evaluate([a, b]) as number, Interval.mul],
    ['min', (a, b) => Num.minOp.evaluate([a, b]) as number, Interval.min],
    ['max', (a, b) => Num.maxOp.evaluate([a, b]) as number, Interval.max],
  ]

  const unaryOps: ReadonlyArray<
    readonly [string, (a: number) => number, (a: Interval.Interval) => Interval.Interval]
  > = [
    ['neg', a => Num.negOp.evaluate([a]) as number, Interval.neg],
    ['abs', a => Num.absOp.evaluate([a]) as number, Interval.abs],
  ]

  const cmpOps: ReadonlyArray<
    readonly [
      string,
      (a: number, b: number) => boolean,
      (a: Interval.Interval, b: Interval.Interval) => Verdict.Verdict<never>,
    ]
  > = [
    ['lt', (a, b) => Num.ltOp.evaluate([a, b]) as boolean, Interval.lt],
    ['lte', (a, b) => Num.lteOp.evaluate([a, b]) as boolean, Interval.lte],
    ['gt', (a, b) => Num.gtOp.evaluate([a, b]) as boolean, Interval.gt],
    ['gte', (a, b) => Num.gteOp.evaluate([a, b]) as boolean, Interval.gte],
    ['is', (a, b) => a === b, Interval.is],
    ['isNot', (a, b) => a !== b, Interval.isNot],
  ]

  return [
    ...binaryOps.map(([op, c, a]) => ({
      op,
      ...galoisBinary(op, c, a, BoundedInt, BoundedInt, options),
    })),
    ...binaryOps.map(([op, c, a]) => ({
      op: `${op}:finite`,
      ...galoisBinary(`${op}:finite`, c, a, BoundedNum, BoundedNum, options),
    })),
    ...unaryOps.map(([op, c, a]) => ({ op, ...galoisUnary(op, c, a, BoundedNum, options) })),
    ...cmpOps.map(([op, c, a]) => ({
      op,
      ...galoisCompare(op, c, a, BoundedInt, BoundedInt, options),
    })),
  ]
}
