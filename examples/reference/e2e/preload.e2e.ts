/**
 * Reading what is on screen, on a touch screen: with `visibleLinks` merged
 * into the notebook's `preload.links`, a note's page is read while its link
 * is only drawn, so a tap draws it at once; without the stream a tap's own
 * touch is the first intent, and the page waits for the read. Every read is
 * held 400 ms at the network so the difference is the read's, not noise.
 * Both timings are printed; the second is the page with `IntersectionObserver`
 * removed before any script runs, which makes `visibleLinks` empty.
 */
import { type Browser, type BrowserContext, type Page, type Request, chromium } from 'playwright'
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

const operationOf = (request: Request): string => {
  if (request.method() !== 'POST' || !request.url().endsWith('/remote')) return ''
  const parsed: unknown = JSON.parse(request.postData() ?? '{}')
  return typeof parsed === 'object' && parsed !== null && 'operation' in parsed
    ? String(parsed.operation)
    : ''
}

/**
 * Milliseconds from a finger's tap on the note's link to its body drawn, on a
 * fresh load of the list, and the reads of the note's body made before and
 * after the tap.
 */
const tapToDrawn = async (
  context: BrowserContext,
  withVisibleLinks: boolean,
): Promise<{ ms: number; readsBeforeTap: number; readsAfterTap: number }> => {
  const page = await context.newPage()
  const operations: Array<string> = []
  page.on('request', request => {
    const operation = operationOf(request)
    if (operation !== '') operations.push(operation)
  })
  if (!withVisibleLinks)
    await page.addInitScript(() => Reflect.deleteProperty(window, 'IntersectionObserver'))
  const link = page
    .getByRole('region', { name: 'Notes' })
    .getByRole('link', { name: 'First light' })
  await page.goto(`${stack.origin}/`)
  await link.waitFor()
  // Long enough for a read started by the list's being drawn to be answered.
  await page.waitForTimeout(HELD * 3)
  const readsBeforeTap = operations.filter(operation => operation === 'read').length
  // A page that still had the note's write to send would hold the body already.
  expect(operations).not.toContain('mutate')
  const started = Date.now()
  await link.tap()
  await page.getByText(BODY).waitFor()
  const ms = Date.now() - started
  const readsAfterTap = operations.filter(operation => operation === 'read').length - readsBeforeTap
  await page.close()
  return { ms, readsBeforeTap, readsAfterTap }
}

test('a note on screen is read before the tap: tap to drawn, with and without visibleLinks', async () => {
  const context = await browser.newContext({ hasTouch: true })
  const page = await context.newPage()
  await signUp(page, 'Ada')
  await page.getByLabel('Title').fill('First light')
  await page.getByLabel('Note', { exact: true }).fill(BODY)
  // Closing the page before the server has answered leaves the write in the
  // outbox, and the next page to load sends it again and shows its answer's body.
  const answered = page.waitForResponse(
    response => response.url().endsWith('/remote') && operationOf(response.request()) === 'mutate',
  )
  await page.getByRole('button', { name: 'Add' }).click()
  await answered
  await page.getByText('Ada, you have written 1 note.').waitFor()
  // The outbox stores the answer after the Model shows it: wait until the
  // queue it keeps no longer holds the note, or the next page sends it again.
  await expect
    .poll(() => page.evaluate(() => Object.values(localStorage).join('')))
    .not.toContain('First light')
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
  console.log(`tap to drawn: ${withStream.ms} ms with visibleLinks, ${without.ms} ms without`)
  expect(without.readsBeforeTap).toBe(0)
  expect(without.readsAfterTap).toBeGreaterThanOrEqual(1)
  expect(withStream.readsBeforeTap).toBeGreaterThanOrEqual(1)
  expect(without.ms).toBeGreaterThanOrEqual(HELD * 0.8)
  expect(withStream.ms).toBeLessThan(without.ms - HELD / 2)
})
