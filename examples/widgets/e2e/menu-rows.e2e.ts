/**
 * The menu-rows section on the real page: opened and driven by keyboard, the
 * second of two rows reading Copy reports its own value.
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

test('picking the second Copy by keyboard reports copy-link and returns focus to the trigger', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const section = await reveal(page, 'Menu rows with a value, an icon and a hint')
  const trigger = section.getByRole('button', { name: 'Actions' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const rows = section.getByRole('menuitem')
  await expect
    .poll(() => rows.allTextContents())
    .toEqual(['RenameF2', 'CopyText', 'CopyLink', 'Archive'])

  const picked = section.getByLabel('Picked')
  // Opened by Enter, the first row is active. One key at a time: the menu reads the next row from the last frame.
  for (const expected of ['CopyText', 'CopyLink']) {
    await page.keyboard.press('ArrowDown')
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector('[role="menuitem"][data-active]')?.textContent),
      )
      .toContain(expected)
  }
  await page.keyboard.press('Enter')
  await expect.poll(() => picked.textContent()).toBe('Picked: copy-link (label Copy)')
  await expect
    .poll(() => trigger.evaluate(element => element === document.activeElement))
    .toBe(true)
  expect(problems).toEqual([])
  await page.close()
})
