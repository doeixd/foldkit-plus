/**
 * The roster Table on the real page: its section loads when it nears the
 * window, a heading sorts the rows, and a row's button works from the keyboard.
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

test('the table sorts by a heading and archives a member from the keyboard', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const section = await reveal(page, 'Table with a row header and markup cells')
  const names = () => section.getByRole('rowheader').allTextContents()
  await expect
    .poll(names)
    .toEqual(['Grace Hopper', 'Ada Lovelace', 'Katherine Johnson', 'Annie Easley'])

  await section.getByRole('button', { name: 'Name' }).click()
  await expect
    .poll(names)
    .toEqual(['Ada Lovelace', 'Annie Easley', 'Grace Hopper', 'Katherine Johnson'])

  await section.getByRole('button', { name: 'Archive Ada Lovelace' }).focus()
  await page.keyboard.press('Enter')
  await section.getByRole('button', { name: 'Restore Ada Lovelace' }).waitFor()
  expect(problems).toEqual([])
  await page.close()
})
