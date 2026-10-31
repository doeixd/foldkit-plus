/**
 * The auth example end to end: its server (Yielded's routes and Remote) and
 * its Vite dev server started here, the dev server rendering each page as
 * the request's principal, and tabs of one Chromium sharing a cookie jar.
 * A visitor asking for the notes is sent home by the server; a sign-in shows
 * the notes the guards allow, already in the page; a sign-out in one tab
 * reaches the other without a reload; a cookie the server no longer knows is
 * refused, not read as a visitor's.
 */
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startHttpServer } from '../src/http.js'
import { accounts, notes } from '../src/server.js'
import { configFor } from '../vite.config.js'
import { onFreePort } from '../../../scripts/free-port.mjs'

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
  // The port can be taken between the probe and Vite's bind: start both again.
  await onFreePort(async () => {
    origin = `http://127.0.0.1:${await freePort()}`
    server = await startHttpServer(0, origin)
    vite = await createServer({
      ...configFor({ origin, authServer: server.url }),
      root: fileURLToPath(new URL('..', import.meta.url)),
      configFile: false,
      logLevel: 'error',
    })
    await vite.listen().catch(async (error: unknown) => {
      await vite.close()
      await server.close()
      throw error
    })
  })
  browser = await chromium.launch()
  context = await browser.newContext()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await server?.close()
})

const open = async (errors: Array<string>, path = '/'): Promise<Page> => {
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`${origin}${path}`)
  return page
}
const who = (page: Page) => page.locator('#who').textContent({ timeout: 120_000 })
const listed = (page: Page) => page.locator('#notes li').allTextContents()
// The server's word on the row, drawn as a badge.
const admin = (page: Page) => page.getByText('Admin', { exact: true }).count()
const pathOf = (page: Page) => new URL(page.url()).pathname
const titlesBy = (author: string) =>
  notes.filter(note => note.authorId === author).map(note => `${note.title} (${note.authorId})`)
const everyTitle = notes.map(note => `${note.title} (${note.authorId})`)

/** The Remote operations `page` asks for from now on, in order. */
const operations = (page: Page): Array<string> => {
  const asked: Array<string> = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/remote')
      asked.push((JSON.parse(request.postData() ?? '{}') as { operation: string }).operation)
  })
  return asked
}

/** The statuses of the Remote answers `page` gets from now on that refused it (401). */
const refusals = (page: Page): Array<number> => {
  const refused: Array<number> = []
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/remote' && response.status() === 401)
      refused.push(response.status())
  })
  return refused
}

/** How many times `page` asks for Yielded's client, a module of its own (`Resource.lazy`). */
const clientImports = (page: Page): Array<string> => {
  const asked: Array<string> = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/src/authClient.ts') asked.push(request.url())
  })
  return asked
}

const signIn = async (page: Page, subjectId: 'ada' | 'grace') => {
  const account = accounts.find(each => each.subjectId === subjectId)!
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Signs this context out, whatever the test before left. */
const signedOut = async () => {
  const page = await open([])
  await expect.poll(() => who(page), { timeout: 120_000 }).not.toBe('Checking who you are…')
  if ((await who(page))?.startsWith('Signed in as') === true) {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect.poll(() => who(page)).toBe('Visitor')
  }
  await page.close()
}

test('a visitor asking for the notes is sent home by the server, and a sign-in goes on to them', async () => {
  const errors: Array<string> = []
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  const imported = clientImports(page)
  const response = await page.goto(`${origin}/notes`)
  const asked = response!.request().redirectedFrom()
  expect(new URL(asked!.url()).pathname).toBe('/notes')
  expect((await asked!.response())!.status()).toBe(303)
  expect(response!.status()).toBe(200)
  expect(new URL(page.url()).search).toBe('?returnTo=%2Fnotes')
  await expect.poll(() => who(page), { timeout: 120_000 }).toBe('Visitor')
  // The page is up, and no one has signed in or out: Yielded's client is not loaded.
  expect(imported).toEqual([])
  // Typing an email starts loading it, before the sign-in is pressed.
  await page.getByLabel('Email').fill('a')
  await expect.poll(() => imported.length).toBe(1)

  await signIn(page, 'ada')
  await expect.poll(() => pathOf(page)).toBe('/notes')
  await expect.poll(() => listed(page)).toEqual(everyTitle)
  expect(imported).toHaveLength(1)
  expect(errors).toEqual([])
})

test("a reader's notes are in the page the server sends, and a sign-out there replaces the address", async () => {
  // Signed in as ada by the test before: the server reads the notes as her.
  const errors: Array<string> = []
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  const response = await page.goto(`${origin}/notes`)
  const served = await response!.text()
  for (const title of notes.map(note => note.title)) expect(served).toContain(title)
  expect(served).toContain('Signed in as ada')
  // Resumed with the page: the browser asks for none of it again.
  await expect.poll(() => who(page), { timeout: 120_000 }).toBe('Signed in as ada')
  await expect.poll(() => listed(page)).toEqual(everyTitle)

  const entries = await page.evaluate(() => history.length)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect.poll(() => pathOf(page)).toBe('/')
  expect(new URL(page.url()).search).toBe('?returnTo=%2Fnotes')
  expect(await page.evaluate(() => history.length)).toBe(entries)
  await expect.poll(() => who(page)).toBe('Visitor')
  expect(errors).toEqual([])
})

test('a sign-out in one tab reaches the other, and a member reads only their notes', async () => {
  await signedOut()
  const errors: Array<string> = []
  const first = await open(errors)
  await expect.poll(() => who(first), { timeout: 120_000 }).toBe('Visitor')

  // `Me` once on signing in, and the notes once on opening them: the tab
  // believed it was a visitor, and forgot that before reading as ada, so
  // nothing is refused first.
  const asked = operations(first)
  await signIn(first, 'ada')
  await expect.poll(() => who(first)).toBe('Signed in as ada')
  expect(await admin(first)).toBe(1)
  await first.getByRole('link', { name: 'Your notes' }).click()
  await expect.poll(() => listed(first)).toEqual(everyTitle)
  await first.waitForTimeout(500)
  expect(asked).toEqual(['read', 'query'])

  // The second tab reads the cookie the first one's sign-in set.
  const second = await open(errors)
  await expect.poll(() => who(second), { timeout: 60_000 }).toBe('Signed in as ada')
  const refusedFirst = refusals(first)
  await second.getByRole('button', { name: 'Sign out' }).click()
  await expect.poll(() => who(second)).toBe('Visitor')

  // The first tab hears it over the broadcast, with no reload, and leaves the
  // notes. It let go of its belief before reading again, so nothing it asked
  // was refused for naming ada.
  await expect.poll(() => who(first)).toBe('Visitor')
  await expect.poll(() => pathOf(first)).toBe('/')
  expect(await admin(first)).toBe(0)
  expect(refusedFirst).toEqual([])

  // Its sign-in goes back to the notes it was sent from.
  await signIn(first, 'grace')
  await expect.poll(() => who(first)).toBe('Signed in as grace')
  await expect.poll(() => pathOf(first)).toBe('/notes')
  await expect.poll(() => listed(first)).toEqual(titlesBy('grace'))
  expect(await admin(first)).toBe(0)
  // And the second tab follows the sign-in too.
  await expect.poll(() => who(second)).toBe('Signed in as grace')
  await second.getByRole('link', { name: 'Your notes' }).click()
  await expect.poll(() => listed(second)).toEqual(titlesBy('grace'))
  expect(errors).toEqual([])
})

test('a session the server no longer holds is refused, and a wrong password is told apart', async () => {
  await signedOut()
  const before = await open([])
  await expect.poll(() => who(before), { timeout: 120_000 }).toBe('Visitor')
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
  await page.getByLabel('Password', { exact: true }).fill('not her password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect
    // The notice, not the line saying who this tab is, which is an alert of its own here.
    .poll(() => page.getByRole('alert').and(page.locator(':not(#who)')).textContent())
    .toBe('That email and password do not match.')
  // A sign-in reads `Me` once: this tab hears its own broadcast, and neither
  // forgets twice nor is refused for the change it made.
  const asked = operations(page)
  await signIn(page, 'ada')
  await expect.poll(() => who(page)).toBe('Signed in as ada')
  await page.getByRole('link', { name: 'Your notes' }).click()
  await expect.poll(() => listed(page)).toEqual(everyTitle)
  await page.waitForTimeout(500)
  expect(asked).toEqual(['read', 'query'])
  expect(errors).toEqual([])
})
