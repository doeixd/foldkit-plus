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
import { type Browser, type ConsoleMessage, type Page, chromium } from 'playwright'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { unstable_startWorker } from 'wrangler'

const root = fileURLToPath(new URL('..', import.meta.url))

const isProblem = (message: ConsoleMessage) =>
  message.text().includes('PageContained') || message.type() === 'error'

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
    if (isProblem(message)) problems.push(message.text())
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

test('the page links its hashed stylesheet in the head, which holds a rule for every class the page draws (#419)', async () => {
  const html = await (await fetch(`${origin}/?q=acme`)).text()
  const head = html.slice(0, html.indexOf('</head>'))
  expect(head).toMatch(
    /<link rel="stylesheet" href="\/assets\/styles-[0-9a-f]{8}\.css" data-foldkit-styles-href>/,
  )
  // The theme is no longer written into the page.
  expect(html).not.toContain('@layer reset')
  const href = /href="(\/assets\/styles-[^"]+\.css)"/.exec(head)?.[1] ?? ''
  const sheet = await fetch(`${origin}${href}`)
  expect(sheet.status).toBe(200)
  expect(sheet.headers.get('content-type')).toContain('text/css')
  const css = await sheet.text()
  const drawn = new Set(html.match(/style-[0-9a-z]+/g))
  expect(drawn.size).toBeGreaterThan(20)
  expect([...drawn].filter(name => !css.includes(`.${name}`))).toEqual([])
})

test('without JavaScript, the built Worker answers a cart form by running update, then a redirect (#388, #390)', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto(`${origin}/?q=acme`)
    const card = page.locator('.domain-card').first()
    const name = (await card.locator('h3').textContent())!
    const answered = page.waitForResponse(
      response => response.request().method() === 'POST' && response.url().includes('?q=acme'),
    )
    await card.getByRole('button', { name: `Add ${name} to cart` }).click()
    const response = await answered
    // Post/Redirect/Get: the page shown is a GET of the address, so a reload posts nothing.
    expect(response.status()).toBe(303)
    expect(await response.headerValue('set-cookie')).toContain(`cart=cart=${name}`)
    await page.waitForURL(/[?]q=acme$/)
    expect(await page.getByRole('region', { name: 'Your cart' }).textContent()).toContain(name)
    const reloaded = page.waitForRequest(request => request.url().includes('?q=acme'))
    await page.reload()
    expect((await reloaded).method()).toBe('GET')
    expect(await page.getByRole('region', { name: 'Your cart' }).textContent()).toContain(name)
  } finally {
    await context.close()
  }
})

/**
 * #420: the build freezes `src/client/style.ts` to data and drops run-time
 * style injection, so the linked sheet is the only source of a rule. Every
 * value read here is the user agent's default when a class has no rule.
 * Hand mutation (the build is outside `pnpm mutate`): drop
 * '/src/client/style.ts' from `modules` in `vite.config.ts`, or delete one
 * rule from the emitted sheet; the first-paint and typed-rows tests go red.
 */
const lookOf = (page: Page) =>
  page.evaluate(() => {
    const read = (selector: string, properties: Array<string>) => {
      const node = document.querySelector(selector)
      if (!node) return { missing: selector }
      const style = getComputedStyle(node)
      return Object.fromEntries(properties.map(name => [name, style.getPropertyValue(name)]))
    }
    const hasRule = (name: string) =>
      [...document.styleSheets].some(sheet =>
        [...sheet.cssRules].some(rule => rule.cssText.includes(`.${name}`)),
      )
    const classes = new Set(
      [...document.querySelectorAll('[class]')].flatMap(node =>
        [...node.classList].filter(name => name.startsWith('style-')),
      ),
    )
    return {
      card: read('.domain-card', ['padding-top', 'border-top-width', 'min-height']),
      header: read('.header', ['position', 'display', 'border-bottom-width']),
      row: read('.domain-row', ['display', 'min-height', 'border-bottom-width']),
      unruled: [...classes].filter(name => !hasRule(name)),
      styles: [...document.querySelectorAll('style')]
        .map(node => node.id || (node.textContent ?? '').slice(0, 60))
        .sort(),
    }
  })

test('the built page is styled at first paint and for rows the runtime draws, with no style injected (#420)', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const problems: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  page.on('console', message => {
    if (isProblem(message)) problems.push(message.text())
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
    await page.locator('.domain-card').first().waitFor({ timeout: 60_000 })
    // `commit` returns before the linked sheet has arrived.
    await page.waitForFunction(
      () => [...document.styleSheets].some(sheet => sheet.href && sheet.cssRules.length > 0),
      undefined,
      { timeout: 60_000 },
    )
    // The bundle is held: only the served markup and the linked sheet draw this.
    const first = await lookOf(page)
    expect(first.card).toEqual({
      'padding-top': '20px',
      'border-top-width': '1px',
      'min-height': '110px',
    })
    expect(first.header).toEqual({
      position: 'sticky',
      display: 'flex',
      'border-bottom-width': '1px',
    })
    expect(first.unruled).toEqual([])

    release()
    await page.locator('#domains-app:not([data-foldkit-plus-resume])').waitFor({ timeout: 60_000 })
    const search = page.getByRole('searchbox', { name: 'Search domains' })
    await search.fill('vercel')
    await page.locator('.domain-row').first().waitFor({ timeout: 60_000 })
    // Rows the server never drew: their classes are the ones injection once covered.
    await expect
      .poll(() => page.locator('.domain-row').evaluateAll(nodes => nodes.length), {
        timeout: 60_000,
      })
      .toBeGreaterThan(0)
    const typed = await lookOf(page)
    expect(typed.row).toEqual({
      display: 'flex',
      'min-height': '57px',
      'border-bottom-width': '1px',
    })
    expect(typed.card).toEqual(first.card)
    expect(typed.unruled).toEqual([])
    // The devtools overlay's one `<style>` is not the app's; a frozen class's rule is.
    expect(first.styles).toEqual([])
    expect(typed.styles).toEqual(['foldkit-devtools-view-transition'])
    expect(problems).toEqual([])
  } finally {
    release()
    await context.close()
  }
})
