/**
 * A field's text under a fine pointer, in a real browser: the body role's
 * 14px. Under a coarse one it is 16px (`type.touch.browser.test.ts`).
 */
import { afterEach, expect, test } from 'vitest'
import { clearField, field } from './typeField.js'

afterEach(clearField)

test('a field reads the body role under a fine pointer', () => {
  expect(matchMedia('(pointer: fine)').matches).toBe(true)
  expect(getComputedStyle(field()).fontSize).toBe('14px')
})
