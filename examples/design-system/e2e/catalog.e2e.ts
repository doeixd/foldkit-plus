/**
 * The catalog widgets the page added: the plan picked as a radio group, a
 * searchable notification list that keeps focus on clear, and topic chips.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startHarness, type Harness } from './harness.js'

let harness: Harness

beforeAll(async () => {
  harness = await startHarness()
})
afterAll(async () => {
  await harness.close()
})

test('the plan is a radio group the arrow keys move', async () => {
  const { page } = await harness.visit(1280, 900)
  const group = page.getByRole('radiogroup', { name: 'Plan' })
  await group.getByRole('radio', { name: 'Pro' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() => group.getByRole('radio', { name: 'Enterprise' }).getAttribute('aria-checked'))
    .toBe('true')
  await page.getByText('Showing overview, week view, enterprise plan.').waitFor()
  await page.close()
})

test('searching narrows the notifications, announces the count, and clearing refocuses the field', async () => {
  const { page } = await harness.visit(1280, 900)
  const field = page.getByRole('searchbox', { name: 'Search notifications' })
  await field.fill('wren')
  await page.getByText('1 of 3 notifications').waitFor()
  expect(await page.getByText('Mentioned by Wren', { exact: true }).count()).toBe(1)
  expect(await page.getByText('Deploy finished', { exact: true }).count()).toBe(0)
  await field.fill('zzz')
  await page.getByText('No notifications match').waitFor()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await page.getByText('3 of 3 notifications').waitFor()
  await expect.poll(() => field.evaluate(input => document.activeElement === input)).toBe(true)
  await page.close()
})

test('topics are chips: Enter adds, the remove button removes', async () => {
  const { page } = await harness.visit(1280, 900)
  const field = page.getByRole('textbox', { name: 'Topics' })
  await field.fill('ui')
  await field.press('Enter')
  await page.getByRole('button', { name: /Remove ui/i }).waitFor()
  await page.getByRole('button', { name: /Remove ui/i }).click()
  expect(await page.getByRole('button', { name: /Remove ui/i }).count()).toBe(0)
  await page.close()
})

test('the Table names its rows by the first column', async () => {
  const { page } = await harness.visit(1280, 900)
  await page.getByRole('rowheader', { name: 'Pro' }).waitFor()
  await page.close()
})
