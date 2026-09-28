// @vitest-environment jsdom
/**
 * A visitor whose session is stored, on the real runtime: the Flags restore
 * it before the first frame, Sign In sends them to the dashboard, and Sign
 * Out clears the store and lands on Home.
 */
import { expect, test } from 'vitest'

import { SESSION_STORAGE_KEY } from '../src/constant.js'
import { byText, expectAt, start, text, waitFor } from './runtime.helpers.js'

test('a stored session is signed in, and signing out forgets it', async () => {
  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ userId: '7', email: 'bob@example.com', name: 'bob' }),
  )
  start('/login')
  await expectAt('/dashboard', 'Dashboard | Auth')
  expect(text()).toContain('Welcome back, bob!')

  byText<HTMLAnchorElement>('a', 'Settings').click()
  await expectAt('/settings', 'Settings | Auth')
  expect(text()).toContain('7')

  byText<HTMLButtonElement>('button', 'Sign Out').click()
  await expectAt('/', 'Auth')
  expect(text()).toContain('Welcome to Auth Example')
  await waitFor(() => expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull())

  byText<HTMLAnchorElement>('a', 'Sign In').click()
  await expectAt('/login', 'Login | Auth')
})
