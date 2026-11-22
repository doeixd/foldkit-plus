/**
 * The SQL of `num.mulScaled`, as text chunks around its two operands, so
 * `sqlLowering` fills them with lowered SQL (a term written twice binds its
 * values twice, which is what a chunk that appears twice needs).
 *
 * A result evaluation refuses (a product or a result past ±(2^53−1)) is NULL,
 * never a wrong number and never an error: Postgres would raise on a `bigint`
 * overflow of `a * b` itself, and SQLite would continue in floating point. So
 * Postgres forms the product as `numeric`, which cannot overflow, and SQLite's
 * overflow lands past the bound as a float; both test the bound first and
 * only then work in integers. Half-even rounding is the integer formula of
 * the standard-library note: with `d = 10^shift`, `r = ((p % d) + d) % d` is
 * the floor remainder, `q = (p - r) / d` the floor quotient, and an exact half
 * goes to the even neighbour.
 */
import type { SqlDialect } from './sqlLowering.js'

export const LEFT = 0
export const RIGHT = 1
export type Chunk = string | typeof LEFT | typeof RIGHT

const SAFE = String(Number.MAX_SAFE_INTEGER)

/** The most places `10^shift` is written out: `10^17` is past int64, which SQLite would read as a float. */
const MAX_DIVISOR_SHIFT = 16

/** The chunks of `num.mulScaled` over a left and a right operand, moved `shift` places down (up where negative). */
export const mulScaledChunks = (dialect: SqlDialect, shift: number): ReadonlyArray<Chunk> => {
  // The product where it cannot overflow: `numeric` on Postgres, and SQLite's own float.
  const wide: ReadonlyArray<Chunk> =
    dialect === 'postgres'
      ? ['(CAST(', LEFT, ' AS numeric) * ', RIGHT, ')']
      : ['(', LEFT, ' * ', RIGHT, ')']
  // The product as an integer, once the bound has passed.
  const exact: ReadonlyArray<Chunk> =
    dialect === 'postgres' ? ['CAST(', ...wide, ' AS bigint)'] : wide
  const outside = (value: ReadonlyArray<Chunk>): ReadonlyArray<Chunk> => [
    ...value,
    ` NOT BETWEEN -${SAFE} AND ${SAFE}`,
  ]
  // Evaluation refuses an operand past the range as well, whatever the other holds (a zero beside it).
  const guarded = (
    test: ReadonlyArray<Chunk>,
    result: ReadonlyArray<Chunk>,
  ): ReadonlyArray<Chunk> => [
    '(CASE WHEN ',
    ...outside(test),
    ' OR ',
    ...outside([LEFT]),
    ' OR ',
    ...outside([RIGHT]),
    ' THEN NULL ELSE ',
    ...result,
    ' END)',
  ]

  if (shift === 0) return guarded(wide, exact)
  // Past 16 places every product in the safe range is under half a unit, and `10^17` is past int64 on
  // SQLite. It is `* 0` and not `0`, since a null operand has no value to round.
  if (shift > MAX_DIVISOR_SHIFT) return guarded(wide, ['(', ...exact, ' * 0)'])
  if (shift < 0) {
    const up = ` * ${10n ** BigInt(-shift)}`
    return guarded(['(', ...wide, up, ')'], ['(', ...exact, up, ')'])
  }
  const d = String(10n ** BigInt(shift))
  const remainder: ReadonlyArray<Chunk> = ['(((', ...exact, ` % ${d}) + ${d}) % ${d})`]
  const quotient: ReadonlyArray<Chunk> = ['((', ...exact, ' - ', ...remainder, `) / ${d})`]
  return guarded(wide, [
    '(',
    ...quotient,
    ' + (CASE WHEN 2 * ',
    ...remainder,
    ` > ${d} THEN 1 WHEN 2 * `,
    ...remainder,
    ` < ${d} THEN 0 WHEN (((`,
    ...quotient,
    ' % 2) + 2) % 2) = 0 THEN 0 ELSE 1 END))',
  ])
}
