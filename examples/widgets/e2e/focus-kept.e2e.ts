/**
 * The focus-kept section on the real page: a visitor dismisses an alert with
 * the keyboard and focus lands on the next alert's dismiss button, empties the
 * cards and lands on their Add button, and shows a toast without focus leaving
 * the button that asked for it. The page throws nothing.
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

test('a dismissed row hands its focus on, and a toast moves none', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const section = await reveal(page, 'Focus kept when rows and toasts go')
  const dismiss = (title: string) => section.getByRole('button', { name: `Dismiss ${title}` })
  const holdsFocus = (name: string) =>
    section.getByRole('button', { name }).evaluate(element => element === document.activeElement)

  await dismiss('Disk almost full').focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => dismiss('Disk almost full').count()).toBe(0)
  await expect.poll(() => holdsFocus('Dismiss Backup finished')).toBe(true)

  for (const title of ['Invoice 1042', 'Invoice 1043', 'Invoice 1044']) {
    await dismiss(title).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => dismiss(title).count()).toBe(0)
  }
  await expect.poll(() => holdsFocus('Add card')).toBe(true)

  const toast = section.getByRole('button', { name: 'Show a toast' })
  await toast.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.getByText('Saved draft 1').count()).toBeGreaterThan(0)
  await expect.poll(() => holdsFocus('Show a toast')).toBe(true)
  expect(problems).toEqual([])
  await page.close()
})
