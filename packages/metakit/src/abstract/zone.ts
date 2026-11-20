/**
 * Zone (Difference-Bound Matrix / DBM) abstract domain tracking linear
 * difference constraints `x - y <= c` across numeric variables.
 *
 * Index `0` is the distinguished constant `0`, so:
 *   - `x <= c` is `x - 0 <= c` (`matrix[x][0] <= c`)
 *   - `x >= c` is `0 - x <= -c` (`matrix[0][x] <= -c`)
 *   - `x - y <= c` is `matrix[x][y] <= c`
 *
 * Floyd-Warshall closure runs in $O(n^3)$ (microseconds for entity-scale $n$)
 * and detects contradictions via negative diagonal entries `matrix[i][i] < 0`.
 */
import * as Interval from './interval.js'

export const ZERO = 0

export class Zone {
  private readonly size: number
  private readonly m: Array<Array<number>>
  private closed: boolean
  private empty: boolean

  private constructor(size: number, m: Array<Array<number>>, closed: boolean, empty: boolean) {
    this.size = size
    this.m = m
    this.closed = closed
    this.empty = empty
  }

  /** Create an unconstrained zone over `varCount` variables (indices `1..varCount`). */
  static make(varCount: number): Zone {
    const size = varCount + 1
    const m: Array<Array<number>> = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) => (i === j ? 0 : Infinity)),
    )
    return new Zone(size, m, true, false)
  }

  clone(): Zone {
    return new Zone(
      this.size,
      this.m.map(row => [...row]),
      this.closed,
      this.empty,
    )
  }

  /** Add `v_i - v_j <= bound`. */
  constrainDiff(i: number, j: number, bound: number): void {
    if (this.empty || !Number.isFinite(bound)) return
    const normalized = Object.is(bound, -0) ? 0 : bound
    if (normalized < this.m[i]![j]!) {
      this.m[i]![j] = normalized
      this.closed = false
      if (i === j && normalized < 0) {
        this.empty = true
      }
    }
  }

  /** Add `v_i <= bound`. */
  constrainUpper(i: number, bound: number): void {
    this.constrainDiff(i, ZERO, bound)
  }

  /** Add `v_i >= bound`. */
  constrainLower(i: number, bound: number): void {
    this.constrainDiff(ZERO, i, -bound)
  }

  /** Add `v_i - v_j == offset`. */
  constrainEq(i: number, j: number, offset: number): void {
    this.constrainDiff(i, j, offset)
    this.constrainDiff(j, i, -offset)
  }

  /**
   * Compute shortest-path closure. Returns `true` if consistent, `false` if a
   * contradiction (negative cycle) was found.
   */
  close(): boolean {
    if (this.empty) return false
    if (this.closed) return true
    const n = this.size
    const m = this.m
    for (let k = 0; k < n; k++) {
      const mk = m[k]!
      for (let i = 0; i < n; i++) {
        const mi = m[i]!
        const mik = mi[k]!
        if (!Number.isFinite(mik)) continue
        for (let j = 0; j < n; j++) {
          const mkj = mk[j]!
          if (!Number.isFinite(mkj)) continue
          const sum = mik + mkj
          if (sum < mi[j]!) {
            mi[j] = Object.is(sum, -0) ? 0 : sum
          }
        }
        if (mi[i]! < 0) {
          this.empty = true
          this.closed = true
          return false
        }
      }
    }
    this.closed = true
    return true
  }

  /** Whether the zone is unsatisfiable (bottom). */
  isBottom(): boolean {
    return !this.close()
  }

  /** Current upper bound on `v_i - v_j`, closing first if needed. */
  diffBound(i: number, j: number): number {
    if (!this.close()) return -Infinity
    return this.m[i]![j]!
  }

  /** Read `m[i][j]` directly without re-closing (for callers that already closed this round). */
  rawBound(i: number, j: number): number {
    return this.m[i]![j]!
  }

  /** True when the zone entails `v_i - v_j <= bound`. */
  impliesDiff(i: number, j: number, bound: number): boolean {
    if (!this.close()) return true
    return this.m[i]![j]! <= bound
  }

  /** Project `v_i` to its tightest interval `[lo, hi]`. */
  intervalOf(i: number): Interval.Interval {
    if (!this.close()) return Interval.bottom
    const lo = this.m[ZERO]![i] === Infinity ? -Infinity : -this.m[ZERO]![i]!
    const hi = this.m[i]![ZERO]!
    return Interval.between(lo, hi)
  }
}
