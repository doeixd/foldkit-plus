/**
 * Reading what is on screen, on a touch screen: with `visibleLinks` merged
 * into the notebook's `preload.links`, a note's page is read while its link
 * is only drawn, so a tap draws it at once; without the stream a tap's own
 * touch is the first intent, and the page waits for the read. Every read is
 * held 400 ms at the network so the difference is the read's, not noise.
 * Both timings are printed; the second is the page with `IntersectionObserver`
 * removed before any script runs, which makes `visibleLinks` empty.
 */
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { buildPage, startStack, type ReferenceStack } from '../src/stack.js'

let stack: ReferenceStack
let browser: Browser

beforeAll(async () => {
  await buildPage()
  stack = await startStack()
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await stack?.stop()
})

const BODY = 'The engine weaves algebraic patterns.'
const HELD = 400

const signUp = async (page: Page, name: string) => {
  await page.goto(`${stack.origin}/`)
  await page.waitForURL(/\/sign-in\?returnTo=%2F$/)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email').fill(`${name.toLowerCase()}@example.invalid`)
  await page.getByLabel('Password', { exact: true }).fill(`${name} keeps a careful notebook`)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL(`${stack.origin}/`)
  await page.getByText(`${name}, you have written 0 notes.`).waitFor()
}

/** Milliseconds from a finger's tap on the note's link to its body drawn, on a fresh load of the list. */
const tapToDrawn = async (context: BrowserContext, withVisibleLinks: boolean): Promise<number> => {
  const page = await context.newPage()
  if (!withVisibleLinks)
    await page.addInitScript(() => Reflect.deleteProperty(window, 'IntersectionObserver'))
  const link = page
    .getByRole('region', { name: 'Notes' })
    .getByRole('link', { name: 'First light' })
  await page.goto(`${stack.origin}/`)
  await link.waitFor()
  // Long enough for a read started by the list's being drawn to be answered.
  await page.waitForTimeout(HELD * 3)
  const started = Date.now()
  await link.tap()
  await page.getByText(BODY).waitFor()
  const elapsed = Date.now() - started
  await page.close()
  return elapsed
}

test('a note on screen is read before the tap: tap to drawn, with and without visibleLinks', async () => {
  const context = await browser.newContext({ hasTouch: true })
  const page = await context.newPage()
  await signUp(page, 'Ada')
  await page.getByLabel('Title').fill('First light')
  await page.getByLabel('Note', { exact: true }).fill(BODY)
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByText('Ada, you have written 1 note.').waitFor()
  await page.close()

  // Reads (not writes) are answered late, as a distant server would.
  await context.route('**/remote', async route => {
    const body = route.request().postData() ?? ''
    if (route.request().method() === 'POST' && !body.includes('"mutate"'))
      await new Promise(resolve => setTimeout(resolve, HELD))
    await route.fallback()
  })

  const without = await tapToDrawn(context, false)
  const withStream = await tapToDrawn(context, true)
  console.log(`tap to drawn: ${withStream} ms with visibleLinks, ${without} ms without`)
  expect(without).toBeGreaterThanOrEqual(HELD * 0.8)
  expect(withStream).toBeLessThan(without - HELD / 2)
})
