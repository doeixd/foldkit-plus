// @vitest-environment jsdom
/**
 * An application filled in and submitted in the real runtime: the email check
 * passes after its 600ms, and the fake submit answers after its 1.5s.
 */
import { afterAll, expect, test, vi } from 'vitest'

import { button, next, start, text, typeInto } from './runtime.helpers.js'

afterAll(() => {
  vi.unstubAllGlobals()
})

test('submits a complete application', async () => {
  await start()
  typeInto('#first-name', 'Jane')
  typeInto('#last-name', 'Doe')
  typeInto('#email', 'jane@example.com')
  // First name, last name, and the email once its check has passed.
  await vi.waitFor(() => expect(text().match(/✓/g)).toHaveLength(3))

  await next('Work History')
  typeInto('input[id$="-company"]', 'Foldkit')
  typeInto('input[id$="-title"]', 'Engineer')
  await next('Education')
  typeInto('input[id$="-school"]', 'MIT')
  typeInto('input[id$="-degree"]', 'BS')
  typeInto('input[id$="-field"]', 'CS')
  await next('Skills')
  typeInto('input[id$="-name"]', 'TypeScript')
  await next('Cover Letter')
  await next('Attachments')
  await next('Review')

  button('Submit Application').click()
  await vi.waitFor(() => expect(text()).toContain('Submitting...'))
  expect(text()).not.toContain('before submitting.')
  await vi.waitFor(() => expect(text()).toContain('Application Submitted!'), { timeout: 3000 })
})
