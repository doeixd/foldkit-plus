/**
 * The theme studio on the real page: a named theme, a tweaked knob, the scheme,
 * the direction, another tab's choice, and a phone's width. `SHOTS=<dir>` also
 * writes screenshots there, for looking at.
 */
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { Page } from 'playwright'
import { reveal, startHarness, type Harness } from './harness.js'

let harness: Harness

beforeAll(async () => {
  harness = await startHarness()
})
afterAll(async () => {
  await harness.close()
})

const shots = process.env['SHOTS']
const shoot = async (page: Page, name: string) => {
  if (shots !== undefined) await page.screenshot({ path: `${shots}/${name}.png` })
}

const root = (page: Page, read: string) =>
  page.evaluate(
    name => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    read,
  )

test('a named theme restyles the page, is announced, and survives a reload', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  await page.getByRole('heading', { name: 'Theme', exact: true }).waitFor()
  const corner = () =>
    page
      .getByRole('button', { name: 'Default', exact: true })
      .first()
      .evaluate(button => getComputedStyle(button).borderTopLeftRadius)
  const before = await corner()
  await shoot(page, 'shadcn-light-1280')
  await page.getByRole('radio', { name: 'Soft' }).click()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset['theme']))
    .toBe('soft')
  expect(await page.locator('#theme-status').textContent()).toBe('Soft theme applied')
  expect(await corner()).not.toBe(before)
  await shoot(page, 'soft-light-1280')
  await page.reload()
  await page.getByRole('radio', { name: 'Soft' }).waitFor()
  expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe('soft')
  expect(await page.getByRole('radio', { name: 'Soft' }).getAttribute('aria-checked')).toBe('true')
  expect(problems).toEqual([])
  await page.close()
})

test('a knob slider moves one knob over the theme, and a theme clears it', async () => {
  const { page } = await harness.visit(1280, 900)
  const radius = page.getByRole('slider', { name: 'Radius' })
  await radius.focus()
  await page.keyboard.press('End')
  await expect.poll(() => root(page, '--fk-knob-radius-factor')).toBe('2.5')
  await page.getByRole('radio', { name: 'Hard' }).click()
  await expect.poll(() => root(page, '--fk-knob-radius-factor')).toBe('0')
  expect(
    await page.getByRole('button', { name: 'Reset tweaks' }).getAttribute('aria-disabled'),
  ).toBe('true')
  await page.close()
})

test('the hard theme stills transitions through the motion knob', async () => {
  const { page } = await harness.visit(1280, 900)
  const duration = () =>
    page
      .getByRole('button', { name: 'Secondary', exact: true })
      .first()
      .evaluate(button => getComputedStyle(button).transitionDuration)
  expect(await duration()).not.toMatch(/^(0s,? ?)+$/)
  await page.getByRole('radio', { name: 'Hard' }).click()
  await expect.poll(duration).toMatch(/^(0s,? ?)+$/)
  await page.close()
})

test('the scheme and direction reach the root, and RTL swaps the arrow keys', async () => {
  const { page } = await harness.visit(1280, 900)
  await page.getByRole('radio', { name: 'Dark' }).click()
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark')
  await shoot(page, 'shadcn-dark-1280')
  if (shots !== undefined) {
    await page.locator('#tokens').screenshot({ path: `${shots}/tokens-dark.png` })
    await page.locator('#cascade').screenshot({ path: `${shots}/cascade-dark.png` })
  }
  await page.getByRole('radio', { name: 'Rtl' }).click()
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl')
  await page.getByRole('radio', { name: 'Rtl' }).focus()
  await page.keyboard.press('ArrowRight')
  expect(await page.getByRole('radio', { name: 'Ltr' }).getAttribute('aria-checked')).toBe('true')
  await page.close()
})

test('another tab\u2019s theme and scheme are taken up here', async () => {
  const context = await harness.browser.newContext({ viewport: { width: 1280, height: 900 } })
  const url = harness.vite.resolvedUrls!.local[0]!
  const first = await context.newPage()
  const second = await context.newPage()
  await first.goto(url)
  await second.goto(url)
  await first.getByRole('radio', { name: 'Compact' }).waitFor()
  await second.getByRole('radio', { name: 'Compact' }).waitFor()
  await second.getByRole('radio', { name: 'Hard' }).click()
  await first
    .getByRole('radio', { name: 'Hard' })
    .and(first.locator('[aria-checked="true"]'))
    .waitFor()
  expect(await first.evaluate(() => document.documentElement.dataset['theme'])).toBe('hard')
  expect(await first.locator('#theme-status').textContent()).toBe(
    'Hard theme chosen in another tab',
  )
  await second.getByRole('radio', { name: 'Dark' }).click()
  await first
    .getByRole('radio', { name: 'Dark' })
    .and(first.locator('[aria-checked="true"]'))
    .waitFor()
  expect(await first.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark')
  await context.close()
})

test('at a phone width the page does not scroll sideways', async () => {
  const { page } = await harness.visit(390, 800)
  await page.getByRole('heading', { name: 'Theme', exact: true }).waitFor()
  await shoot(page, 'shadcn-light-390')
  const islands = [
    'buttons',
    'form',
    'choice',
    'overlays',
    'feedback',
    'navigation',
    'calendar',
    'collections',
    'utilities',
  ]
  for (const theme of ['Soft', 'Hard', 'Compact']) {
    await page.getByRole('radio', { name: theme }).click()
    for (const island of islands) {
      await reveal(page, island)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${theme}, ${island}`).toBeLessThanOrEqual(0)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
  }
  await page.close()
})
