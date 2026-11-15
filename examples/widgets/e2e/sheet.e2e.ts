/**
 * The sheet section on the real page: scrolled to, it loads, and a visitor
 * opens the sheet, raises it with the handle's keys, and closes it with
 * Escape, which gives focus back to the opener. The page throws nothing.
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

test('the sheet opens on its lowest point, the handle’s keys raise it, and Escape closes it', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const section = await reveal(page, 'Sheet with snap points')
  const opener = section.getByRole('button', { name: 'Open sheet' })
  await opener.focus()
  await page.keyboard.press('Enter')

  const handle = page.getByRole('separator', { name: 'Resize sheet' })
  await handle.waitFor({ timeout: 30_000 })
  await expect.poll(() => handle.getAttribute('aria-valuenow')).toBe('30')
  await expect.poll(() => handle.evaluate(element => element === document.activeElement)).toBe(true)

  await page.keyboard.press('ArrowUp')
  await expect.poll(() => handle.getAttribute('aria-valuenow')).toBe('60')
  await expect.poll(() => page.getByText('60% of the sheet shows').count()).toBe(1)
  await page.keyboard.press('End')
  await expect.poll(() => handle.getAttribute('aria-valuenow')).toBe('100')

  await page.keyboard.press('Escape')
  await expect.poll(() => handle.count(), { timeout: 15_000 }).toBe(0)
  await expect.poll(() => section.getByText('Sheet closed').count()).toBe(1)
  await expect.poll(() => opener.evaluate(element => element === document.activeElement)).toBe(true)
  expect(problems).toEqual([])
  await page.close()
})
