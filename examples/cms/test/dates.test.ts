/**
 * A post's date is one day for everyone: the build that rendered its page and
 * a reader in any time zone draw the same one.
 */
import { Option } from 'effect'
import { afterEach, expect, it } from 'vitest'
import { dateOf } from '../src/site.js'

const zone = process.env['TZ']
afterEach(() => {
  if (zone === undefined) delete process.env['TZ']
  else process.env['TZ'] = zone
})

it.each(['UTC', 'Pacific/Kiritimati', 'Pacific/Honolulu'])(
  'says the day it was in UTC, in %s',
  at => {
    process.env['TZ'] = at
    expect(dateOf(Option.some('2026-09-21T23:56:00.000Z'))).toBe('September 21, 2026')
  },
)
