import { describe, expect, test } from 'vitest'

import { COUNT_COOKIE, readCountCookie } from '../src/cookie.js'

describe('readCountCookie', () => {
  test.each([
    ['no cookie at all', '', 0],
    ['the count', `${COUNT_COOKIE}=4`, 4],
    ['a negative count', `${COUNT_COOKIE}=-3`, -3],
    ['the count among other cookies', `theme=dark; ${COUNT_COOKIE}=7; lang=en`, 7],
    ['a percent-encoded count', `${COUNT_COOKIE}=%34%32`, 42],
    ['only other cookies', 'theme=dark', 0],
    ['an empty value', `${COUNT_COOKIE}=`, 0],
    ['text', `${COUNT_COOKIE}=abc`, 0],
    ['a fraction', `${COUNT_COOKIE}=1.5`, 0],
    ['a number past the safe integers', `${COUNT_COOKIE}=99999999999999999999`, 0],
    ['Infinity', `${COUNT_COOKIE}=Infinity`, 0],
    ['a cookie whose name only starts the same', `${COUNT_COOKIE}-old=9`, 0],
  ])('reads %s as %d', (_case, header, count) => {
    expect(readCountCookie(header)).toBe(count)
  })
})
