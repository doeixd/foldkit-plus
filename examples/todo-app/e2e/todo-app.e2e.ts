/**
 * The todo app end to end: its sync server on a SQLite file and its Vite dev
 * server started here, and two Chromium pages as two people. A todo one adds
 * reaches the other through the journal without a reload, and is still there
 * after one, read back from the server.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { openJournal, type ServerJournal } from '../src/journal.js'
import { startSyncServer, type SyncServer } from '../src/server.js'
import { onFreePort } from '../../../scripts/free-port.mjs'

const documentId = 'todos'
let directory: string
let journal: ServerJournal
let server: SyncServer
let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'todo-app-e2e-'))
  journal = openJournal(join(directory, 'todos.db'))
  server = await startSyncServer({
    journal,
    authenticate: token =>
      token === null ? undefined : { principal: { actorId: token, documentId, canWrite: true } },
  })
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: {
      port: 0,
      // The proxy goes to this run's server, on the port it was given.
      proxy: { '/sync': { target: server.url, ws: true } },
    },
  })
  await onFreePort(() => vite.listen())
  url = vite.resolvedUrls!.local[0]!
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await server?.close()
  journal?.close()
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true })
})

const open = async (token: string) => {
  const page = await browser.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`${url}?token=${token}`)
  await page.waitForSelector('input[aria-label="New todo"]', { timeout: 120_000 })
  return { page, errors }
}
const titles = (page: Page) =>
  page.locator('li span[title="Double-click to rename"]').allTextContents()

test('a todo one person adds reaches another, and is kept across a reload', async () => {
  const alice = await open('alice')
  const bob = await open('bob')
  await alice.page.fill('input[aria-label="New todo"]', 'Water the plants')
  await alice.page.press('input[aria-label="New todo"]', 'Enter')
  await expect.poll(() => titles(alice.page)).toContain('Water the plants')
  // Bob's page hears of the commit: nothing on it was touched.
  await expect.poll(() => titles(bob.page), { timeout: 10_000 }).toContain('Water the plants')

  // The journal holds it as Alice's fact, not only the replicas.
  expect(journal.read(documentId, 0)).toContainEqual(
    expect.objectContaining({
      actorId: 'alice',
      message: expect.objectContaining({ _tag: 'SubmittedTodo', title: 'Water the plants' }),
    }),
  )

  await bob.page.reload()
  await bob.page.waitForSelector('input[aria-label="New todo"]', { timeout: 60_000 })
  await expect.poll(() => titles(bob.page), { timeout: 10_000 }).toContain('Water the plants')
  expect([...alice.errors, ...bob.errors]).toEqual([])
  await alice.page.close()
  await bob.page.close()
})

// Alice again, in a new browser: a replica named by her token, not by the tab,
// would restart its operation ids, and the journal would refuse them as reused.
test('the same person in a second browser adds a todo, and another marks it done', async () => {
  const alice = await open('alice')
  const bob = await open('bob')
  await alice.page.fill('input[aria-label="New todo"]', 'Buy bread')
  await alice.page.press('input[aria-label="New todo"]', 'Enter')
  const row = (page: Page) => page.locator('li', { hasText: 'Buy bread' })
  await expect.poll(() => row(bob.page).count(), { timeout: 10_000 }).toBe(1)
  await row(bob.page).getByRole('checkbox').click()
  await expect
    .poll(() => row(alice.page).getByRole('checkbox').getAttribute('aria-checked'), {
      timeout: 10_000,
    })
    .toBe('true')
  expect([...alice.errors, ...bob.errors]).toEqual([])
  await alice.page.close()
  await bob.page.close()
})

// A phone has no hover: what a pointer reveals on hover must already be there for a finger.
test('on a touch phone a todo’s delete button shows, is a finger’s size, and deletes', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`${url}?token=carol`)
  await page.waitForSelector('input[aria-label="New todo"]', { timeout: 120_000 })
  await page.fill('input[aria-label="New todo"]', 'Call the plumber')
  await page.press('input[aria-label="New todo"]', 'Enter')
  const remove = page.getByRole('button', { name: 'Delete "Call the plumber"' })
  await expect.poll(() => remove.count()).toBe(1)
  expect(await remove.evaluate(button => getComputedStyle(button).opacity)).toBe('1')
  const box = (await remove.boundingBox())!
  expect([box.width, box.height].every(side => side >= 24)).toBe(true)
  const priority = page.getByRole('button', { name: /^Priority .*, click to change$/ }).first()
  expect((await priority.boundingBox())!.height).toBeGreaterThanOrEqual(24)
  await remove.tap()
  await expect.poll(() => titles(page)).not.toContain('Call the plumber')
  expect(errors).toEqual([])
  await context.close()
})

test('the app sits centred at the top of the page, on a surface of its own', async () => {
  const { page, errors } = await open('dave')
  const app = page.locator('.app')
  const box = (await app.boundingBox())!
  const width = await page.evaluate(() => document.documentElement.clientWidth)
  expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(1)
  expect(box.y).toBeGreaterThanOrEqual(48)
  const [body, card] = await Promise.all([
    page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    app.evaluate(element => getComputedStyle(element).backgroundColor),
  ])
  expect(body).not.toBe(card)
  expect(errors).toEqual([])
  await page.close()
})
