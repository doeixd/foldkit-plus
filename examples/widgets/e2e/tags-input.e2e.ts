/**
 * The topics form on the real page: Enter adds a tag without submitting, the
 * arrow keys walk the chips, Delete removes one, a draft is added when focus
 * leaves the field, and a submit names exactly the chips.
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

test('tags are added from the keyboard, walked, removed and submitted as the chips', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const section = await reveal(page, 'Tags input in a form')
  const chips = () => section.getByRole('listitem').allTextContents()
  const status = section.locator('#topics-receipt')
  const field = section.getByRole('textbox', { name: 'Topics' })

  await expect.poll(chips).toEqual(['foldkit×', 'effect×'])
  await field.click()
  await page.keyboard.type('react')
  await page.keyboard.press('Enter')
  await expect.poll(chips).toEqual(['foldkit×', 'effect×', 'react×'])
  expect(await status.textContent()).toBe('')

  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Remove effect')
  await page.keyboard.press('Delete')
  await expect.poll(chips).toEqual(['foldkit×', 'react×'])

  await field.click()
  await page.keyboard.type('solid')
  await section.getByRole('button', { name: 'Submit' }).click()
  await expect.poll(() => status.textContent()).toBe('Submitted foldkit, react, solid')
  expect(problems).toEqual([])
  await page.close()
})
