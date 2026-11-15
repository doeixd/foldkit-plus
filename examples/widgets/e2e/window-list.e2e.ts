/**
 * The window list's go-to form on the real page: a row far below is brought
 * into view while the list stays at about thirty drawn rows, and a number
 * past the list is refused by the field itself.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import { NAMES } from '../src/window-list/app.js'
import { type Harness, startHarness } from './harness.js'

let harness: Harness
beforeAll(async () => {
  harness = await startHarness()
})
afterAll(async () => {
  await harness?.close()
})

test('go to row 700 brings it into view, and a number past the list does not submit', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const field = page.getByLabel('Go to row')
  await field.waitFor({ timeout: 120_000 })
  const list = page.getByRole('list', { name: 'Names' })
  await list.getByRole('listitem').first().waitFor()

  await field.fill('1200')
  await field.scrollIntoViewIfNeeded()
  const before = await page.evaluate(() => window.scrollY)
  await page.getByRole('button', { name: 'Go' }).click()
  expect(
    await field.evaluate(element => (element as HTMLInputElement).validity.rangeOverflow),
  ).toBe(true)
  expect(await page.evaluate(() => window.scrollY)).toBe(before)

  await field.fill('700')
  await page.getByRole('button', { name: 'Go' }).click()
  const row = list.getByText(NAMES[699]!)
  await row.waitFor()
  await expect
    .poll(() => row.evaluate(element => element.getBoundingClientRect().top))
    .toBeGreaterThan(0)
  await expect
    .poll(() =>
      row.evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight),
    )
    .toBe(true)
  expect(await list.getByRole('listitem').count()).toBeLessThan(45)
  expect(problems).toEqual([])
  await page.close()
})
