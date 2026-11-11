/**
 * A price range typed in dollars, as the query's bounds in cents: rounded
 * inward, so the server keeps only prices inside the range typed, and held
 * within what the query's `Int` input takes.
 */
import { Option, Schema } from 'effect'
import { expect, test } from 'vitest'
import { centsOf } from '../src/app.js'

const bounds = (min: Option.Option<number>, max: Option.Option<number>) =>
  centsOf(Option.some({ min, max }))

test('rounds a lowest price up and a highest price down, to whole cents', () => {
  expect(bounds(Option.some(1.234), Option.some(1.239))).toEqual({ minCents: 124, maxCents: 123 })
  expect(bounds(Option.some(-1.234), Option.some(-1.239))).toEqual({
    minCents: -123,
    maxCents: -124,
  })
})

test('keeps a whole number of cents that floating point misses', () => {
  // 1.23 * 100 is 122.99999999999999, and 0.29 * 100 is 28.999999999999996.
  expect(bounds(Option.some(1.23), Option.some(0.29))).toEqual({ minCents: 123, maxCents: 29 })
  expect(bounds(Option.some(1.15), Option.some(1.15))).toEqual({ minCents: 115, maxCents: 115 })
})

test('holds a price past any the table could hold within the query’s Int', () => {
  const { minCents, maxCents } = bounds(Option.some(1e300), Option.some(-1e300))
  expect(minCents).toBe(Number.MAX_SAFE_INTEGER)
  expect(maxCents).toBe(-Number.MAX_SAFE_INTEGER)
  expect(Schema.is(Schema.Int)(minCents)).toBe(true)
  expect(Schema.is(Schema.Int)(maxCents)).toBe(true)
})

test('gives null where no bound or no filter is given', () => {
  expect(bounds(Option.none(), Option.some(2))).toEqual({ minCents: null, maxCents: 200 })
  expect(centsOf(Option.none())).toEqual({ minCents: null, maxCents: null })
})
