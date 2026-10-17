/**
 * A field's text on a touch screen, in the `browser-touch` project, whose
 * page is one from the start: 16px under a coarse pointer, where iOS Safari
 * would otherwise zoom the page into it.
 */
import { afterEach, expect, test } from 'vitest'
import { clearField, field } from './typeField.js'

afterEach(clearField)

test('a field is 16px under a coarse pointer, so iOS does not zoom into it', () => {
  expect(matchMedia('(pointer: coarse)').matches).toBe(true)
  expect(getComputedStyle(field()).fontSize).toBe('16px')
})
