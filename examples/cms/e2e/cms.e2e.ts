/**
 * The CMS end to end: its HTTP server (SQLite in memory, seeded) and its Vite
 * dev server started here, and Chromium in each chair. A writer's saved draft
 * is not on the site; an editor's publish puts it there.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startHttpServer } from '../src/server/http.js'

let server: Awaited<ReturnType<typeof startHttpServer>>
let vite: ViteDevServer
let browser: Browser
let url: string

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
  url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await server?.close()
})

const open = async (path: string) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`${url}${path}`)
  return { page, errors }
}
const status = (page: Page) => page.locator('#studio-main [role="status"]').textContent()
/** What a visitor reads, opened afresh: the blog's titles, or one post's heading. */
const visitor = async (path: string, selector: string) => {
  const { page, errors } = await open(path)
  await page.waitForSelector(selector, { timeout: 120_000 })
  const texts = await page.locator(selector).allTextContents()
  await page.close()
  return { texts, errors }
}
const blogTitles = () => visitor('/site/blog', 'main li h3')

test('a writer’s draft is saved but not public, and an editor’s publish makes it so', async () => {
  const wren = await open('/?as=wren')
  await wren.page.getByRole('button', { name: 'New post' }).click({ timeout: 120_000 })
  await wren.page.getByRole('textbox', { name: 'Title' }).fill('Notes on bread')
  await wren.page.getByRole('textbox', { name: 'Excerpt' }).fill('Flour, water, salt, time.')
  await wren.page.getByRole('textbox', { name: 'Body' }).fill('A loaf wants a day.')
  await expect.poll(() => status(wren.page), { timeout: 10_000 }).toBe('Draft saved.')
  expect(await wren.page.getByRole('textbox', { name: 'Address' }).inputValue()).toBe(
    'notes-on-bread',
  )
  // A writer cannot publish.
  expect(await wren.page.getByRole('button', { name: 'Publish' }).count()).toBe(0)

  // Saved is not published: the draft is kept beside the posts, and the blog
  // a visitor reads lists the seed's posts and not this one.
  const before = await blogTitles()
  expect(before.texts).toContain('Saving is not publishing')
  expect(before.texts).not.toContain('Notes on bread')

  // The editor opens the same post from the address the writer's page shows.
  const edda = await open(`/${new URL(wren.page.url()).search.replace('as=wren', 'as=edda')}`)
  await expect
    .poll(() => edda.page.getByRole('textbox', { name: 'Title' }).inputValue(), {
      timeout: 120_000,
    })
    .toBe('Notes on bread')
  await edda.page.getByRole('button', { name: 'Publish' }).click()
  await expect.poll(() => status(edda.page), { timeout: 10_000 }).toBe('Published.')

  const after = await blogTitles()
  expect(after.texts).toContain('Notes on bread')
  const post = await visitor('/site/blog/notes-on-bread', 'main h1')
  expect(post.texts).toEqual(['Notes on bread'])
  expect([
    ...wren.errors,
    ...edda.errors,
    ...before.errors,
    ...after.errors,
    ...post.errors,
  ]).toEqual([])
  await wren.page.close()
  await edda.page.close()
})
