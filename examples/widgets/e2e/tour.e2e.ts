/**
 * The tour section on the real page: a visitor starts the tour and the notes
 * panel from their buttons, ends each with Escape, and focus is on the button
 * that opened it. The page throws nothing.
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

test('the tour and the notes panel give focus back to the button that opened them', async () => {
  const { page, problems } = await harness.visit(1280, 900)
  const section = await reveal(page, 'Tour and floating panel return focus')
  const holdsFocus = (name: string) =>
    section.getByRole('button', { name }).evaluate(element => element === document.activeElement)

  await section.getByRole('button', { name: 'Start tour' }).focus()
  await page.keyboard.press('Enter')
  const step = page.getByRole('dialog', { name: 'Search' })
  await step.waitFor({ timeout: 30_000 })
  await expect.poll(() => step.evaluate(element => element === document.activeElement)).toBe(true)
  await page.keyboard.press('Escape')
  await expect.poll(() => step.count()).toBe(0)
  await expect.poll(() => holdsFocus('Start tour')).toBe(true)
  await expect.poll(() => page.getByText('The tour skipped').count()).toBe(1)

  await section.getByRole('button', { name: 'Open notes' }).focus()
  await page.keyboard.press('Enter')
  const notes = page.getByRole('dialog', { name: 'Notes' })
  await notes.waitFor({ timeout: 30_000 })
  await expect.poll(() => notes.evaluate(element => element === document.activeElement)).toBe(true)
  await page.keyboard.press('Escape')
  await expect.poll(() => notes.count()).toBe(0)
  await expect.poll(() => holdsFocus('Open notes')).toBe(true)
  expect(problems).toEqual([])
  await page.close()
})
