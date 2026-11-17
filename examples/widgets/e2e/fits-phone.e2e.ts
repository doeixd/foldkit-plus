/**
 * The page on a phone: after every lazy section has loaded, nothing is wider
 * than the layout viewport, so the page never scrolls sideways. A phone zooms
 * out to fit a page that overflows, so the check reads the layout viewport
 * (`clientWidth`), not `innerWidth`.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import { type Harness, startHarness } from './harness.js'

let harness: Harness

beforeAll(async () => {
  harness = await startHarness()
})

afterAll(async () => {
  await harness?.close()
})

test.each([390, 412])('no section is wider than a %ipx phone', async width => {
  const { page, problems } = await harness.visit(width, 844)
  await page.locator('section h2').first().waitFor({ timeout: 120_000 })
  const headings = await page.locator('section h2').allTextContents()
  for (const [index, heading] of headings.entries()) {
    const section = page.locator('section').nth(index)
    await section.scrollIntoViewIfNeeded({ timeout: 120_000 })
    // A lazy section's container is replaced by its drawing once its code has loaded.
    await expect
      .poll(
        () =>
          section.evaluate(
            element =>
              element.querySelector(':scope > :not(h2)')?.querySelector('*') !== null ||
              element.querySelector(':scope > :not(h2, div)') !== null,
          ),
        { message: heading, timeout: 120_000 },
      )
      .toBe(true)
  }

  // The widest thing on the page, named, so a failure says where to look.
  const wide = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth
    return {
      scrollWidth: document.documentElement.scrollWidth,
      limit,
      offenders: [...document.querySelectorAll('section')]
        .filter(
          section => section.scrollWidth > limit || section.getBoundingClientRect().right > limit,
        )
        .map(section => section.querySelector('h2')?.textContent ?? section.id),
    }
  })
  expect(wide.offenders).toEqual([])
  expect(wide.scrollWidth).toBeLessThanOrEqual(wide.limit)
  expect(problems).toEqual([])
  await page.close()
})
