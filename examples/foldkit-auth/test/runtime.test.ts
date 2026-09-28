// @vitest-environment jsdom
/**
 * A visitor with no stored session, on the real runtime: a protected page
 * sends them to Sign In, a failed and then a good sign-in, the session saved
 * in localStorage, and the logged-in side's guard.
 */
import { expect, test } from 'vitest'

import { SESSION_STORAGE_KEY } from '../src/constant.js'
import { byText, expectAt, start, text, typeInto, waitFor } from './runtime.helpers.js'

const submitButton = (): HTMLButtonElement => {
  const button = document.querySelector<HTMLButtonElement>('form button[type="submit"]')
  if (button === null) throw new Error('no submit button')
  return button
}

test('signing in from a protected page', async () => {
  window.localStorage.clear()
  start('/settings')
  await expectAt('/login', 'Login | Auth')
  expect(submitButton().getAttribute('aria-disabled')).toBe('true')

  typeInto('email', 'alice@example.com')
  typeInto('password', 'wrong')
  await waitFor(() => expect(submitButton().getAttribute('aria-disabled')).toBeNull())
  submitButton().click()
  await waitFor(() => expect(submitButton().textContent).toBe('Signing in...'))
  await waitFor(() => expect(text()).toContain('Invalid credentials'))
  expect(submitButton().getAttribute('aria-disabled')).toBe('true')
  expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()

  typeInto('password', 'password')
  await waitFor(() => expect(submitButton().getAttribute('aria-disabled')).toBeNull())
  submitButton().click()
  await expectAt('/dashboard', 'Dashboard | Auth')
  expect(text()).toContain('Welcome back, alice!')
  expect(text()).toContain('Signed in as alice@example.com')
  await waitFor(() =>
    expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null')).toEqual({
      userId: '1',
      email: 'alice@example.com',
      name: 'alice',
    }),
  )

  window.history.pushState(null, '', '/login')
  window.dispatchEvent(new PopStateEvent('popstate'))
  await expectAt('/dashboard', 'Dashboard | Auth')

  byText<HTMLAnchorElement>('a', 'Settings').click()
  await expectAt('/settings', 'Settings | Auth')
  expect(text()).toContain('Account Information')
})
