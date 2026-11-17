/**
 * The file form on the real page: files chosen in the input are listed, a
 * submit names exactly the listed files, and removing a row from the keyboard
 * leaves focus on the field.
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

test('chosen files are listed and submitted, and a keyboard removal keeps focus on the field', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const section = await reveal(page, 'File input in a form')
  const rows = () => section.getByRole('listitem').locator('span').allTextContents()
  const status = section.getByRole('status')

  await section.locator('input[type="file"]').setInputFiles([
    { name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('a') },
    { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('bb') },
  ])
  await expect.poll(rows).toEqual(['resume.pdf', 'photo.png'])

  await section.getByRole('button', { name: 'Submit' }).click()
  await expect.poll(() => status.textContent()).toBe('Submitted resume.pdf, photo.png')

  await section.getByRole('button', { name: 'Remove resume.pdf' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(rows).toEqual(['photo.png'])
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('type')))
    .toBe('file')
  await expect.poll(() => status.textContent()).toBe('')

  await section.getByRole('button', { name: 'Submit' }).click()
  await expect.poll(() => status.textContent()).toBe('Submitted photo.png')
  // Foldkit's dev-tools relay, attached under `vite dev`, rejects the `File`s the Model holds with
  // "Expected JSON value"; that upstream behaviour is the one page error ignored, every other fails.
  expect(problems.filter(problem => !problem.includes('Expected JSON value'))).toEqual([])
  await page.close()
})
