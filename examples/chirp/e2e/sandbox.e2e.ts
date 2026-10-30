/**
 * The demo end to end: the Vite dev server, so the server runs in a
 * SharedWorker on SQLite compiled to WebAssembly, and Chromium as two people.
 * A chirp posted shows at once, holds still until the server answers it, and
 * survives a reload; Edit shows only where the server says the reader may,
 * and saves in place; a like is kept; a chirp its author deletes is gone,
 * after a reload too.
 */
import { Behaviors } from 'foldkit-plus/testing/playwright'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { mutation } from '../../../scripts/mutation-plugin.mjs'

let vite: ViteDevServer
let browser: Browser
let url: string

beforeAll(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0 },
    // `pnpm mutate`'s edits reach the page this server builds.
    plugins: [mutation()],
  })
  await vite.listen()
  url = vite.resolvedUrls!.local[0]!
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

/** A post on the page, found by what it says. */
const post = (page: Page, text: string) => page.getByRole('article').filter({ hasText: text })

const open = async (page: Page, query: string) => {
  await page.goto(`${url}${query}`)
  await post(page, 'The engine weaves').waitFor({ timeout: 120_000 })
}

test('posting, editing what you may, liking and deleting, kept by the server in the browser', async () => {
  // One context: the tabs of one browser, which share its SharedWorker.
  const context = await browser.newContext()
  const errors: Array<string> = []
  const you = await context.newPage()
  you.on('pageerror', error => errors.push(String(error)))
  await open(you, '?reset')

  // Posting: at the top at once, the box empty for the next one.
  await you.getByLabel("What's happening?").fill('Shipping Chirp today.')
  await you.getByRole('button', { name: 'Chirp', exact: true }).click()
  await expect
    .poll(() => you.getByRole('article').first().textContent())
    .toContain('Shipping Chirp today.')
  await expect.poll(() => you.getByLabel("What's happening?").inputValue()).toBe('')

  // Edit shows on your own posts only: the new one and the seed's.
  await expect.poll(() => you.getByRole('button', { name: 'Edit' }).count()).toBe(2)
  expect(await post(you, 'The engine weaves').getByRole('button', { name: 'Edit' }).count()).toBe(0)
  await post(you, 'Shipping Chirp today.').getByRole('button', { name: 'Edit' }).click()
  await you.getByLabel('Your chirp').fill('Shipping Chirp today. Edited.')
  await you.getByRole('button', { name: 'Save' }).click()
  await you.getByText('Saved.').waitFor()
  await you.getByRole('button', { name: 'Done' }).click()
  await expect.poll(() => post(you, 'Shipping Chirp today. Edited.').count()).toBe(1)

  // A like: shown at once, kept, and taken back.
  const heart = () => post(you, 'A ship in port').getByRole('button', { name: /^Like/ })
  await expect.poll(() => heart().textContent()).toBe('2')
  await heart().click()
  await expect.poll(() => heart().textContent()).toBe('3')
  expect(await heart().getAttribute('aria-pressed')).toBe('true')
  await you.reload()
  await post(you, 'The engine weaves').waitFor()
  await expect.poll(() => heart().textContent()).toBe('3')
  expect(await heart().getAttribute('aria-pressed')).toBe('true')
  await heart().click()
  await expect.poll(() => heart().textContent()).toBe('2')
  expect(await heart().getAttribute('aria-pressed')).toBe('false')

  // Ada, the admin, in another tab of the same sandbox: Edit on every post,
  // the edited chirp among them.
  const ada = await context.newPage()
  ada.on('pageerror', error => errors.push(String(error)))
  await open(ada, '?as=ada')
  await expect.poll(() => post(ada, 'Shipping Chirp today. Edited.').count()).toBe(1)
  await expect
    .poll(() => ada.getByRole('button', { name: 'Edit' }).count())
    .toBe(await ada.getByRole('article').count())
  // She edits it, and may not take it down: that is its author's alone.
  expect(
    await post(ada, 'Shipping Chirp today. Edited.')
      .getByRole('button', { name: 'Delete' })
      .count(),
  ).toBe(0)

  // Deleted by its author: gone at once, from the server too, so a reload and
  // Ada's tab find it gone.
  await post(you, 'Shipping Chirp today. Edited.').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => post(you, 'Shipping Chirp today. Edited.').count()).toBe(0)
  await you.reload()
  await post(you, 'The engine weaves').waitFor()
  expect(await post(you, 'Shipping Chirp today. Edited.').count()).toBe(0)
  await ada.reload()
  await post(ada, 'The engine weaves').waitFor()
  expect(await post(ada, 'Shipping Chirp today. Edited.').count()).toBe(0)

  expect(errors).toEqual([])
  await context.close()
})

test('a chirp posted holds still where it is drawn until the server answers it', async () => {
  const context = await browser.newContext()
  const you = await context.newPage()
  const errors = Behaviors.consoleErrors(you)
  // Each write waits before it is sent, as over a slow network, so the chirp
  // is drawn well before its answer lands.
  await open(you, '?reset&latency=1500')
  // A write answered is recorded as done in the outbox the page keeps.
  const answered = () =>
    you.evaluate(
      () =>
        (
          JSON.parse(localStorage.getItem('chirp-outbox:you') ?? '{"done":[]}') as {
            readonly done: ReadonlyArray<string>
          }
        ).done.length,
    )
  const before = await answered()
  await you.getByLabel("What's happening?").fill('Steady as she goes.')
  await Behaviors.optimistic(you, {
    act: () => you.getByRole('button', { name: 'Chirp', exact: true }).click(),
    shows: post(you, 'Steady as she goes.'),
    writes: { answered: () => expect.poll(answered, { timeout: 20_000 }).toBeGreaterThan(before) },
  })
  expect(errors()).toEqual([])
  await context.close()
})

test('a chirp posted offline waits, survives a reload, and is sent once back online', async () => {
  const context = await browser.newContext()
  const errors: Array<string> = []
  const you = await context.newPage()
  you.on('pageerror', error => errors.push(String(error)))
  const waiting = () => you.getByRole('status').filter({ hasText: 'waiting to send' })

  // Offline: the sandbox refuses every write as a dropped connection would.
  await open(you, '?reset&offline')
  await you.getByLabel("What's happening?").fill('Written in a tunnel.')
  await you.getByRole('button', { name: 'Chirp', exact: true }).click()
  await expect
    .poll(() => you.getByRole('article').first().textContent())
    .toContain('Written in a tunnel.')
  await expect.poll(() => waiting().textContent()).toBe('1 chirp waiting to send')

  // A reload, still offline: the chirp is read back from the outbox, shown, and waits.
  await you.reload()
  await post(you, 'The engine weaves').waitFor()
  await expect.poll(() => post(you, 'Written in a tunnel.').count()).toBe(1)
  await expect.poll(() => waiting().textContent()).toBe('1 chirp waiting to send')

  // Online again: the page sends what waits, and the server keeps it.
  await open(you, '')
  await expect.poll(() => waiting().count()).toBe(0)
  const ada = await context.newPage()
  ada.on('pageerror', error => errors.push(String(error)))
  await open(ada, '?as=ada')
  await expect.poll(() => post(ada, 'Written in a tunnel.').count()).toBe(1)

  expect(errors).toEqual([])
  await context.close()
})
