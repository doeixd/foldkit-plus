/**
 * The application-keys section on the real page: End and Escape on the
 * Command, PageDown on the Menubar, and the refusal drawn as text.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import { type Harness, reveal, startHarness } from './harness.js'

let harness: Harness

beforeAll(async () => {
  harness = await startHarness()
})

afterAll(async () => {
  await harness?.close()
})

test('the application’s keys work on the Command and the bar, and the refused routes are drawn', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const section = await reveal(page, 'Application keys on shipped widgets')
  const field = section.getByRole('combobox', { name: 'Commands' })
  const answers = section.getByLabel('Answers')

  await field.fill('file')
  await expect
    .poll(() => section.getByRole('option').allTextContents())
    .toEqual(['Open file', 'Save file'])
  await field.press('End')
  await expect
    .poll(() => field.getAttribute('aria-activedescendant'))
    .toBe('keys-command-save-file')
  await field.press('Enter')
  await expect.poll(() => answers.textContent()).toContain('Ran: save-file')
  await field.press('Escape')
  await expect.poll(() => field.inputValue()).toBe('')

  const bar = section.getByRole('menubar', { name: 'Editor' })
  await bar.getByRole('menuitem', { name: 'File' }).focus()
  await page.keyboard.press('PageDown')
  await expect.poll(() => answers.textContent()).toContain('Bar tab stop: View')
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('View')

  const refused = section.getByLabel('Refused routes').getByRole('listitem')
  await expect.poll(() => refused.count()).toBe(2)
  expect(await refused.first().textContent()).toContain('mixins:key-conflict')
  expect(problems).toEqual([])
  await page.close()
})
