// @vitest-environment jsdom
/** The Flags read localStorage and decode it; anything unreadable is no session. */
import { Effect, Option } from 'effect'
import { afterEach, expect, test } from 'vitest'

import { SESSION_STORAGE_KEY } from '../src/constant.js'
import { flags } from '../src/main.js'

afterEach(() => window.localStorage.clear())

const bob = { userId: '7', email: 'bob@example.com', name: 'bob' }

test.each([
  ['a stored session', JSON.stringify(bob), Option.some(bob)],
  ['nothing stored', undefined, Option.none()],
  ['text that is not JSON', 'bob', Option.none()],
  [
    'JSON missing a field',
    JSON.stringify({ userId: '7', email: 'bob@example.com' }),
    Option.none(),
  ],
])('%s gives the expected session', async (_, stored, maybeSession) => {
  if (stored !== undefined) window.localStorage.setItem(SESSION_STORAGE_KEY, stored)
  expect(await Effect.runPromise(flags)).toEqual({ maybeSession })
})
