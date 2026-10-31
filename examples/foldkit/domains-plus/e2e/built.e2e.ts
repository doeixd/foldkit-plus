/**
 * The built Worker end to end, as `pnpm preview` serves it: `pnpm build`, then
 * Wrangler's local workerd with the build's static assets, which answers a
 * request with a file when one is at its path, query or not, and with the
 * Worker otherwise.
 *
 * `pnpm mutate` cannot reach the build, which runs in a child process; with
 * `prerender: true` in `vite.config.ts` restored by hand, the #383 test fails
 * on the empty box.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { unstable_startWorker } from 'wrangler'

const root = fileURLToPath(new URL('..', import.meta.url))

let worker: Awaited<ReturnType<typeof unstable_startWorker>>
let browser: Browser
let origin: string

beforeAll(async () => {
  const built = spawnSync('pnpm build', { cwd: root, shell: true, encoding: 'utf8' })
  if (built.status !== 0) throw new Error(`pnpm build failed:\n${built.stdout}${built.stderr}`)
  worker = await unstable_startWorker({
    config: `${root}wrangler.jsonc`,
    dev: { server: { hostname: '127.0.0.1', port: 0 }, inspector: false, logLevel: 'error' },
  })
  origin = (await worker.url).origin
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await worker?.dispose()
})

test('a page opened at ?q= shows the query in the box before the bundle runs (#383)', async () => {
  const page = await browser.newPage()
  const problems: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  page.on('console', message => {
    if (message.type() === 'error' || message.text().includes('PageContained'))
      problems.push(message.text())
  })
  let release = () => {}
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route('**/assets/*.js', async route => {
    await held
    await route.continue()
  })
  try {
    await page.goto(`${origin}/?q=acme`, { waitUntil: 'commit' })
    const search = page.getByRole('searchbox', { name: 'Search domains' })
    await search.waitFor({ timeout: 60_000 })
    // The bundle is held, so this is the served markup: Foldkit's stamp is still on its root.
    expect(await page.locator('[data-foldkit-app]').count()).toBe(1)
    expect(await search.inputValue()).toBe('acme')
    const served = await search.elementHandle()

    release()
    await expect.poll(() => page.locator('[data-foldkit-app]').count(), { timeout: 60_000 }).toBe(0)
    // Resumed, not contained: the served field is the one the runtime kept.
    expect(await served?.evaluate(node => node === document.getElementById('domain-search'))).toBe(
      true,
    )
    expect(await search.inputValue()).toBe('acme')
    expect(new URL(page.url()).search).toBe('?q=acme')
    expect(problems).toEqual([])
  } finally {
    release()
    await page.close()
  }
})
