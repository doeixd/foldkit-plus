// @vitest-environment node
/** The fixture `scripts/test/mutate.test.ts` mutates; red only when asked. */
import { expect, test } from 'vitest'
import { sum } from './sum.js'

test('adds', () => {
  expect(sum(1, 2)).toBe(3)
  expect(process.env['FIXTURE_RED']).toBeUndefined()
})
