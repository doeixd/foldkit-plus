/**
 * The entity example end to end: its HTTP server (SQLite in memory) and its
 * Vite dev server started here, and Chromium driving the page. A title saved
 * from the form changes the row, is in the table the server reads, and is
 * there after a reload.
 */
import { fileURLToPath } from 'node:url'
import { Effect } from 'effect'
import { REMOTE_PROTOCOL_VERSION, Remote } from 'foldkit-remote'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startHttpServer } from '../src/http.js'

let server: Awaited<ReturnType<typeof startHttpServer>>
let vite: ViteDevServer
let browser: Browser
let page: Page

beforeAll(async () => {
  server = await startHttpServer(0)
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: {
      port: 0,
      // The proxy goes to this run's server, on the port it was given.
      proxy: { '/remote': { target: new URL(server.url).origin } },
    },
  })
  await vite.listen()
  browser = await chromium.launch()
  page = await browser.newPage()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await server?.close()
})

const titleCell = () => page.getByRole('row', { name: /^p1 / }).getByRole('cell').nth(1)

test('a title saved from the form is the row’s, the server’s, and the reload’s', async () => {
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(vite.resolvedUrls!.local[0]!)
  await page.getByRole('button', { name: 'p1' }).click({ timeout: 120_000 })
  const title = page.getByRole('textbox', { name: 'Title' })
  await expect.poll(() => title.inputValue()).toBe('Notes on the Engine')
  await title.fill('Notes on the Engine, revised')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => titleCell().textContent()).toBe('Notes on the Engine, revised')

  // The server wrote it: Remote reads it back from the table.
  const read = await Effect.runPromise(
    Remote.http(server.url).FoldkitRemoteRead({
      version: REMOTE_PROTOCOL_VERSION,
      requests: [{ entity: 'Post', id: 'p1', fields: ['title'] }],
    }),
  )
  expect(read.entities).toEqual([
    { entity: 'Post', id: 'p1', values: { title: 'Notes on the Engine, revised' } },
  ])

  await page.reload()
  await expect
    .poll(() => titleCell().textContent(), { timeout: 60_000 })
    .toBe('Notes on the Engine, revised')
  expect(errors).toEqual([])
})
