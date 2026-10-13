/**
 * The auth example end to end: its server (Yielded's routes and Remote) and
 * its Vite dev server started here, and two tabs of one Chromium sharing a
 * cookie jar. A sign-in shows the notes the guards allow; a sign-out in one
 * tab reaches the other without a reload; a cookie the server no longer
 * knows is refused, not read as a visitor's.
 */
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startHttpServer } from '../src/http.js'
import { accounts, notes } from '../src/server.js'

let server: Awaited<ReturnType<typeof startHttpServer>>
let vite: ViteDevServer
let browser: Browser
let context: BrowserContext
let origin: string

/**
 * A port nothing listens on now. Yielded trusts one origin, named before
 * either server starts, so the page's port is chosen first.
 */
const freePort = () =>
  new Promise<number>(resolve => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })

beforeAll(async () => {
  const port = await freePort()
  origin = `http://127.0.0.1:${port}`
  server = await startHttpServer(0, origin)
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: {
      port,
      proxy: { '/auth': { target: server.url }, '/remote': { target: server.url } },
    },
  })
  await vite.listen()
  browser = await chromium.launch()
  context = await browser.newContext()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await server?.close()
})

const open = async (errors: Array<string>): Promise<Page> => {
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(origin)
  return page
}
const who = (page: Page) => page.locator('#who').textContent({ timeout: 120_000 })
const listed = (page: Page) => page.locator('#notes li').allTextContents()
const admin = (page: Page) => page.locator('#admin').count()
const titlesBy = (author: string) =>
  notes.filter(note => note.authorId === author).map(note => `${note.title} (${note.authorId})`)

/** The Remote operations `page` asks for from now on, in order. */
const operations = (page: Page): Array<string> => {
  const asked: Array<string> = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/remote')
      asked.push((JSON.parse(request.postData() ?? '{}') as { operation: string }).operation)
  })
  return asked
}

const signIn = async (page: Page, subjectId: 'ada' | 'grace') => {
  const account = accounts.find(each => each.subjectId === subjectId)!
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('a sign-out in one tab reaches the other, and a member reads only their notes', async () => {
  const errors: Array<string> = []
  const first = await open(errors)
  await expect.poll(() => who(first), { timeout: 120_000 }).toBe('Visitor')
  await expect.poll(() => first.locator('#notes').textContent()).toBe('NotesNo notes you may read.')

  // `Me` and the notes, read once each: the tab believed it was a visitor,
  // and forgot that before reading as ada, so nothing is refused first.
  const asked = operations(first)
  await signIn(first, 'ada')
  await expect.poll(() => who(first)).toBe('Signed in as ada')
  expect(await admin(first)).toBe(1)
  await expect
    .poll(() => listed(first))
    .toEqual(notes.map(note => `${note.title} (${note.authorId})`))
  await first.waitForTimeout(500)
  expect(asked).toEqual(['read', 'query'])

  // The second tab reads the cookie the first one's sign-in set.
  const second = await open(errors)
  await expect.poll(() => who(second), { timeout: 60_000 }).toBe('Signed in as ada')
  await second.getByRole('button', { name: 'Sign out' }).click()
  await expect.poll(() => who(second)).toBe('Visitor')

  // The first tab hears it over the broadcast, with no reload.
  await expect.poll(() => who(first)).toBe('Visitor')
  await expect.poll(() => first.locator('#notes').textContent()).toBe('NotesNo notes you may read.')
  expect(await admin(first)).toBe(0)

  await signIn(first, 'grace')
  await expect.poll(() => who(first)).toBe('Signed in as grace')
  await expect.poll(() => listed(first)).toEqual(titlesBy('grace'))
  expect(await admin(first)).toBe(0)
  // And the second tab follows the sign-in too.
  await expect.poll(() => who(second)).toBe('Signed in as grace')
  await expect.poll(() => listed(second)).toEqual(titlesBy('grace'))
  expect(errors).toEqual([])
})

test('a session the server no longer holds is refused, and a wrong password is told apart', async () => {
  // Signed in here, whatever the test before left: this one stands alone.
  const before = await open([])
  await expect.poll(() => who(before), { timeout: 120_000 }).not.toBe('Checking who you are…')
  if ((await who(before))?.startsWith('Signed in as') === true) {
    await before.getByRole('button', { name: 'Sign out' }).click()
    await expect.poll(() => who(before)).toBe('Visitor')
  }
  await signIn(before, 'ada')
  await expect.poll(() => who(before)).toBe('Signed in as ada')
  await before.close()
  // A restart empties the in-memory store; the browser still holds the cookie.
  const { port } = new URL(server.url)
  await server.close()
  server = await startHttpServer(Number(port), origin)

  const errors: Array<string> = []
  const page = await open(errors)
  await expect.poll(() => who(page)).toBe('Your session ended. Sign in again.')
  await page.getByLabel('Email').fill('ada@example.invalid')
  await page.getByLabel('Password').fill('not her password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect
    .poll(() => page.locator('#notice').textContent())
    .toBe('That email and password do not match.')
  // A sign-in reads `Me` and the notes once each: this tab hears its own
  // broadcast, and neither forgets twice nor is refused for the change it made.
  const asked = operations(page)
  await signIn(page, 'ada')
  await expect.poll(() => who(page)).toBe('Signed in as ada')
  await expect.poll(() => listed(page)).toEqual(notes.map(n => `${n.title} (${n.authorId})`))
  await page.waitForTimeout(500)
  expect(asked).toEqual(['read', 'query'])
  expect(errors).toEqual([])
})
