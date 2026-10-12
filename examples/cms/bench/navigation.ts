/**
 * §33.10's open question, measured: is a generated page of the site better
 * reached by a full load (its HTML, the page already drawn) or by a Navigate
 * Command (no load, drawn from what the browser holds), with and without the
 * read-ahead a pointer gives (`Data.preload`)?
 *
 * Serves `dist` (from `pnpm --filter foldkit-example-cms build:sandbox`) as
 * Cloudflare Pages does, opens the blog in Chromium, and goes to a post three
 * ways, each run timed in the page from the reader's action to the post's
 * heading on screen. Every request is delayed by the round trip given, to
 * stand for a network; the sandbox's own server is in the browser, so its
 * reads never cross it. Medians of seven runs after two warm-ups.
 *
 * With `--server`, the same against `dist-server` (`FOLDKIT_BUILD_ID=bench
 * vite build --outDir dist-server`), whose pages read over HTTP from the
 * CMS's own server, started here, so every read crosses the network too.
 *
 * Run: pnpm --filter foldkit-example-cms bench:navigation [-- --server]
 */
import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Option } from 'effect'
import { chromium, type Page } from 'playwright'
import { startHttpServer } from '../src/server/http.js'

const overServer = process.argv.includes('--server')
const dist = fileURLToPath(new URL(overServer ? '../dist-server' : '../dist', import.meta.url))
const POST = '/site/blog/a-page-is-data'
const TITLE = 'A page is data'
const RUNS = 7
const WARMUPS = 2

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
}

/** The file a static host serves for a path: `/site/blog` is `site/blog.html`. */
const fileOf = async (pathname: string): Promise<string | undefined> => {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '')
  for (const candidate of [clean, `${clean}.html`, join(clean, 'index.html')]) {
    const path = join(dist, candidate)
    if (!path.startsWith(dist)) return undefined
    const found = await stat(path).catch(() => undefined)
    if (found?.isFile() === true) return path
  }
  return undefined
}

/** Hands a page's `/remote` request to the CMS server at `remote`, as the deploy's proxy would. */
const forward = async (
  request: IncomingMessage,
  response: ServerResponse,
  remote: string,
): Promise<void> => {
  const chunks: Array<Buffer> = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const answered = await fetch(remote, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chair': String(request.headers['x-chair']),
    },
    body: Buffer.concat(chunks),
  })
  response.writeHead(answered.status, { 'content-type': 'application/json' })
  response.end(Buffer.from(await answered.arrayBuffer()))
}

const serve = (remote: Option.Option<string>) =>
  new Promise<{ readonly origin: string; readonly close: () => void }>(resolve => {
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://bench')
      if (url.pathname === '/remote' && Option.isSome(remote))
        return forward(request, response, remote.value)
      const path = await fileOf(url.pathname)
      if (path === undefined) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, {
        'content-type': types[extname(path)] ?? 'application/octet-stream',
        // As `_headers` says: hashed assets for a year, every page asked again.
        'cache-control': url.pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'max-age=0, must-revalidate',
      })
      response.end(await readFile(path))
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('no port')
      resolve({ origin: `http://127.0.0.1:${address.port}`, close: () => server.close() })
    })
  })

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

/** The blog, read and settled, with a round trip of `latency` on every request. */
const onBlog = async (page: Page, origin: string, latency: number) => {
  // tsx names the functions this script hands the page with a helper of its own.
  await page.addInitScript({ content: 'globalThis.__name = (fn) => fn' })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  await page.goto(`${origin}/site/blog`)
  await page.locator(`main a[href="${POST}"]`).first().waitFor({ timeout: 60_000 })
  // The sandbox keeps a connection open, so the network never idles: the
  // runtime has taken the page over and read the blog well within this.
  await page.waitForLoadState('load')
  await page.waitForTimeout(1_000)
}

/** From the reader's click to the post's heading on screen, timed in the page. */
const clickToHeading = (page: Page) =>
  page.evaluate(
    ({ post, title }) =>
      new Promise<number>(resolve => {
        const link = document.querySelector<HTMLAnchorElement>(`main a[href="${post}"]`)
        if (link === null) throw new Error('no link to the post')
        const shown = () => document.querySelector('main h1')?.textContent === title
        const started = performance.now()
        const observer = new MutationObserver(() => {
          if (!shown()) return
          observer.disconnect()
          // The frame the change is painted in.
          requestAnimationFrame(() => resolve(performance.now() - started))
        })
        observer.observe(document.body, { subtree: true, childList: true, characterData: true })
        link.click()
      }),
    { post: POST, title: TITLE },
  )

type Scenario = (page: Page, origin: string, latency: number) => Promise<number>

/** The post's own HTML: from the navigation's start to its first paint with content. */
const fullLoad: Scenario = async (page, origin, latency) => {
  await onBlog(page, origin, latency)
  await page.goto(`${origin}${POST}`)
  await page.locator('main h1', { hasText: TITLE }).waitFor()
  return page.evaluate(
    () =>
      new Promise<number>(resolve => {
        const read = () => {
          const paint = performance.getEntriesByName('first-contentful-paint')[0]
          if (paint === undefined) requestAnimationFrame(read)
          else resolve(paint.startTime)
        }
        read()
      }),
  )
}

/** The same full load, until the page's scripts have run (`load`). */
const fullLoadScripts: Scenario = async (page, origin, latency) => {
  await onBlog(page, origin, latency)
  await page.goto(`${origin}${POST}`, { waitUntil: 'load' })
  return page.evaluate(() => {
    const [entry] = performance.getEntriesByType('navigation') as Array<PerformanceNavigationTiming>
    return entry!.loadEventEnd
  })
}

const navigate: Scenario = async (page, origin, latency) => {
  await onBlog(page, origin, latency)
  return clickToHeading(page)
}

const navigatePreloaded: Scenario = async (page, origin, latency) => {
  await onBlog(page, origin, latency)
  await page.locator(`main a[href="${POST}"]`).first().hover()
  // A reader's hover before a click: long enough for the read ahead to land.
  await page.waitForTimeout(400)
  return clickToHeading(page)
}

const main = async () => {
  const remote = overServer ? Option.some(await startHttpServer(0)) : Option.none()
  const { origin, close } = await serve(Option.map(remote, server => server.url))
  const browser = await chromium.launch()
  const scenarios: ReadonlyArray<readonly [string, Scenario]> = [
    ['full load, content painted', fullLoad],
    ['full load, scripts run', fullLoadScripts],
    ['Navigate', navigate],
    ['Navigate after a hover', navigatePreloaded],
  ]
  const latencies = [0, 100]
  console.log(
    `| from /site/blog to the post | ${latencies.map(l => `${l} ms round trip`).join(' | ')} |`,
  )
  console.log(`| --- | ${latencies.map(() => '---:').join(' | ')} |`)
  for (const [name, scenario] of scenarios) {
    const cells: Array<string> = []
    for (const latency of latencies) {
      // One context per scenario and latency: its cache warms over the warm-ups, as a reader's would.
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      const times: Array<number> = []
      for (let run = 0; run < WARMUPS + RUNS; run++) {
        const page = await context.newPage()
        const time = await scenario(page, origin, latency)
        if (run >= WARMUPS) times.push(time)
        await page.close()
      }
      await context.close()
      cells.push(`${median(times).toFixed(0)} ms`)
    }
    console.log(`| ${name} | ${cells.join(' | ')} |`)
  }
  await browser.close()
  close()
  if (Option.isSome(remote)) await remote.value.close()
}

void main()
