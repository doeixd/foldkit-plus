/**
 * The catalog widgets the page added: the plan picked as a radio group, a
 * searchable notification list that keeps focus on clear, and topic chips.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import { reveal, startHarness, type Harness } from './harness.js'

let harness: Harness

beforeAll(async () => {
  harness = await startHarness()
})
afterAll(async () => {
  await harness.close()
})

test('the plan is a radio group the arrow keys move', async () => {
  const { page } = await harness.visit(1280, 900)
  await reveal(page, 'navigation')
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
  await reveal(page, 'collections')
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
  await reveal(page, 'form')
  const field = page.getByRole('textbox', { name: 'Topics' })
  await field.fill('ui')
  await field.press('Enter')
  await page.getByRole('button', { name: /Remove ui/i }).waitFor()
  await page.getByRole('button', { name: /Remove ui/i }).click()
  await expect.poll(() => page.getByRole('button', { name: /Remove ui/i }).count()).toBe(0)
  await page.close()
})

test('the Table names its rows by the first column', async () => {
  const { page } = await harness.visit(1280, 900)
  await reveal(page, 'collections')
  await page.getByRole('rowheader', { name: 'Pro' }).waitFor()
  await page.close()
})

test('the Menu draws icons, shortcuts, a tone and a disabled row, and reports the row picked', async () => {
  const { page } = await harness.visit(1280, 900)
  await reveal(page, 'overlays')
  await page.getByRole('button', { name: 'Actions' }).click()
  const reply = page.getByRole('menuitem', { name: /Reply/ })
  expect(await reply.getAttribute('aria-keyshortcuts')).toBe('Meta+R')
  expect(await reply.locator('svg').count()).toBe(1)
  expect(await page.getByRole('menuitem', { name: /Delete/ }).getAttribute('data-tone')).toBe(
    'destructive',
  )
  expect(await page.getByRole('menuitem', { name: /Archive/ }).getAttribute('aria-disabled')).toBe(
    'true',
  )
  await page.getByRole('menuitem', { name: /Forward/ }).click()
  await page.getByText('Chose Forward.').waitFor()
  await page.close()
})

test('a dismissed alert hands its focus to the next, then the previous, then Add', async () => {
  const { page } = await harness.visit(1280, 900)
  await reveal(page, 'feedback')
  const dismiss = (title: string) => page.getByRole('button', { name: `Dismiss ${title}` })
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await dismiss('Invite accepted').focus()
  await page.keyboard.press('Enter')
  await expect.poll(focused).toBe('Dismiss Quota at 80%')
  await page.keyboard.press('Enter')
  await expect.poll(focused).toBe('Dismiss Backup finished')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('add-notice')
  await page.close()
})

test('the Toolbar has one tab stop, moves by arrows over the disabled tool, and Home and End jump', async () => {
  const { page } = await harness.visit(1280, 900)
  await reveal(page, 'buttons')
  const bar = page.getByRole('toolbar', { name: 'Text style' })
  const active = () => page.evaluate(() => document.activeElement?.textContent)
  await bar.getByRole('button', { name: 'Bold' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(active).toBe('Italic')
  await page.keyboard.press('ArrowRight')
  await expect.poll(active).toBe('Underline')
  await page.keyboard.press('Home')
  await expect.poll(active).toBe('Bold')
  await page.keyboard.press('End')
  await expect.poll(active).toBe('Underline')
  await expect.poll(() => bar.locator('button[tabindex="0"]').count()).toBe(1)
  await page.close()
})
