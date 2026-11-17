/**
 * The choices section on the real page: the arrows on the radio group, and
 * the slider's committed value following its live one only at the release.
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

test('the radio group roves and the slider commits at the release', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const section = await reveal(page, 'Segmented choices and a slider')
  const readout = section.getByLabel('Choices')

  await section.getByRole('radio', { name: 'Medium' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => readout.textContent()).toContain('Size: l')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-checked')))
    .toBe('true')

  await section.getByRole('button', { name: 'Italic' }).click()
  await expect.poll(() => readout.textContent()).toContain('Styles: italic')

  const thumb = section.getByRole('slider', { name: 'Volume' })
  const box = (await thumb.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 })
  await expect.poll(() => readout.textContent()).toContain('Committed: 50 (commits 0)')
  expect(await readout.textContent()).not.toContain('Live: 50 ')
  await page.mouse.up()
  await expect.poll(() => readout.textContent()).toMatch(/Committed: (?!50 )\d+ \(commits 1\)/)
  expect(problems).toEqual([])
  await page.close()
})
