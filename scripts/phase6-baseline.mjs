/**
 * `node scripts/phase6-baseline.mjs`: what domains-plus's search page costs a
 * browser today, as the numbers a later change to hydration or to script
 * loading is judged against (docs/design/metakit-phase-6-DESIGN.md).
 *
 * It builds the example for production with the build id pinned, runs the
 * built Worker in this process behind a plain HTTP server (no Wrangler: the
 * figures are the browser's), and reads, for `/?q=acme`:
 *
 * - the page's bytes, and the resume envelope's by field and by part;
 * - the script the page loads before the runtime has taken over, brotli;
 * - at `--throttle` (4) times slower CPU, in a fresh context per run: every
 *   long task from navigation start, when the runtime took over, and the
 *   first press of "Add … to cart" on the first result, pressed either as
 *   `load` fires or once the page rests. A press is read as the browser's own
 *   `first-input` entry (its delay and its duration to the next paint, which
 *   is what Interaction to Next Paint reports for one interaction) and as the
 *   time until the cart button shows the domain.
 *
 * Every timed figure is given with the range of its runs: a later difference
 * inside that range is not one.
 *
 * Usage: node scripts/phase6-baseline.mjs [--reps 7] [--throttle 4]
 *   [--no-build] (reuse the last build) [--out <file.json>] (every run)
 *   [--phases] (a build of its own with Foldkit's `slow` timings switched on,
 *   as `render-baseline.mjs` does: how long the runtime's `view` and `patch`
 *   ran before it took over, which is the most a skipped subtree could save.
 *   The instrumented build's other figures are not the baseline's.)
 *
 * It builds, serves and drives a browser: run it alone.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { brotliCompressSync } from 'node:zlib'
import { chromium } from 'playwright'
import { createBuilder } from 'vite'
import { bootProbe, environment, probe, recorder, spread, writeTo } from './render-baseline.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const appRoot = join(root, 'examples', 'foldkit', 'domains-plus')
const phases = process.argv.includes('--phases')
// Inside the app's own node_modules: the built Worker's bare imports resolve from where it is written.
const outDir = join(appRoot, 'node_modules', phases ? '.phase6-phases' : '.phase6-baseline')
const PAGE = '/?q=acme'
const PRESS = 'the first press of "Add … to cart" on the first result'

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}
const reps = Number(option('reps', '7'))
const throttle = Number(option('throttle', '4'))
const warmups = 2
const out = option('out', undefined)

const buildApp = async () => {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  // The client and the Worker must agree on it, and a pinned one keeps two builds' bytes the same.
  process.env.FOLDKIT_BUILD_ID = 'phase6-baseline'
  const builder = await createBuilder({
    root: appRoot,
    configFile: join(appRoot, 'vite.config.ts'),
    plugins: [
      ...(phases
        ? [probe('/examples/foldkit/domains-plus/src/client/entry.ts', '    container,\n')]
        : []),
      writeTo(outDir),
    ],
    build: { outDir, emptyOutDir: true },
    logLevel: 'warn',
  })
  await builder.buildApp()
}

const types = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
}

/** The built Worker, with a file of the client build answering at its own path, as the static host does. */
const serve = async () => {
  const worker = (await import(pathToFileURL(join(outDir, 'server', 'fetch.js')).href)).default
  const client = join(outDir, 'client')
  const context = { waitUntil: () => undefined, passThroughOnException: () => undefined }
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host}`)
      const file = normalize(join(client, decodeURIComponent(url.pathname)))
      if (file.startsWith(client) && existsSync(file) && statSync(file).isFile()) {
        outgoing.writeHead(200, {
          'content-type': types[extname(file)] ?? 'application/octet-stream',
          'cache-control': 'public, max-age=31536000, immutable',
        })
        outgoing.end(await readFile(file))
        return
      }
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers))
        for (const one of [value].flat()) if (one !== undefined) headers.append(name, one)
      const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD'
      const response = await worker.fetch(
        new Request(url, {
          method: incoming.method,
          headers,
          ...(hasBody ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
        }),
        {},
        context,
      )
      outgoing.statusCode = response.status
      for (const [name, value] of response.headers)
        if (name !== 'set-cookie') outgoing.setHeader(name, value)
      const cookies = response.headers.getSetCookie()
      if (cookies.length > 0) outgoing.setHeader('set-cookie', cookies)
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      console.error(error)
      outgoing.statusCode = 500
      outgoing.end(String(error))
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

const bytes = text => Buffer.byteLength(text)
const brotli = text => brotliCompressSync(Buffer.from(text)).length

/** The page's bytes, and its resume envelope's: whole, by field, and `parts` by part. */
const pageBytes = async origin => {
  const html = await (await fetch(`${origin}${PAGE}`)).text()
  const attribute = / data-foldkit-plus-resume='([^']*)'/.exec(html)
  if (attribute === null) throw new Error('phase6-baseline: the page carries no resume envelope')
  // Written in single quotes with only `&` and `'` escaped.
  const json = attribute[1].replaceAll('&#39;', "'").replaceAll('&amp;', '&')
  const envelope = JSON.parse(json)
  const sizes = record =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, bytes(JSON.stringify(value))]),
    )
  return {
    html: bytes(html),
    htmlBrotli: brotli(html),
    envelopeInPage: bytes(attribute[0]),
    envelopeJson: bytes(json),
    envelopeJsonBrotli: brotli(json),
    fields: sizes(envelope),
    parts: sizes(envelope.parts ?? {}),
    state: sizes(envelope.state ?? {}),
  }
}

/** Installed before the page's scripts: the first input, and every interaction the browser timed. */
const pressProbe = () => {
  window.__first = []
  new PerformanceObserver(list => {
    for (const entry of list.getEntries())
      window.__first.push({
        name: entry.name,
        delay: entry.processingStart - entry.startTime,
        duration: entry.duration,
      })
  }).observe({ type: 'first-input', buffered: true })
}

const cartButton = page => page.getByRole('button', { name: 'Cart, 1 domains' })

/**
 * One load of the page in a context of its own, CPU slowed. `at: 'load'`
 * presses as `load` fires; `at: 'rest'` reads the boot first (long tasks, the
 * takeover, the served elements the runtime rebuilt), then presses.
 */
const loadOnce = async (browser, origin, at) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(bootProbe)
    await page.addInitScript(pressProbe)
    if (phases) await page.addInitScript(recorder)
    const problems = []
    page.on('pageerror', error => problems.push(String(error)))
    page.on('console', message => message.type() === 'error' && problems.push(message.text()))
    const scripts = new Set()
    page.on('request', request => request.resourceType() === 'script' && scripts.add(request.url()))
    let documents = 0
    page.on('framenavigated', frame => frame === page.mainFrame() && documents++)
    const session = await context.newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    await page.goto(`${origin}${PAGE}`, { waitUntil: 'load' })
    let boot
    if (at === 'rest') {
      await page.waitForFunction(() => window.__takeover !== undefined, undefined, {
        timeout: 60_000,
      })
      // Nothing else long may follow the takeover before it is read.
      await page.waitForTimeout(1500)
      boot = await page.evaluate(() => ({
        takeover: window.__takeover,
        blocking: window.__long.reduce((sum, ms) => sum + ms, 0),
        // What Total Blocking Time counts: each long task's time past 50 ms.
        over50: window.__long.reduce((sum, ms) => sum + Math.max(0, ms - 50), 0),
        tasks: window.__long.length,
        longest: Math.max(0, ...window.__long),
        served: window.__served.length,
        rebuilt: window.__served.filter(
          element =>
            !element.isConnected &&
            element.tagName !== 'STYLE' &&
            element.getAttribute('name') !== 'foldkit-plus-message',
        ).length,
      }))
      if (phases) {
        const records = await page.evaluate(() => globalThis.__renderRecords)
        const ran = phase =>
          records
            .filter(record => record.phase === phase && record.at <= boot.takeover + 50)
            .reduce((sum, record) => sum + record.ms, 0)
        boot = { ...boot, view: ran('View'), patch: ran('Patch'), update: ran('Update') }
      }
    }
    const scriptsBeforePress = [...scripts]
    const button = page
      .locator('.domain-card')
      .first()
      .getByRole('button', { name: /^Add .* to cart$/ })
    const documentsBefore = documents
    const started = Date.now()
    await button.click()
    await cartButton(page).waitFor({ timeout: 60_000 })
    const shown = Date.now() - started
    // A press the runtime did not answer is the form's post: a new document, whose entries these are not.
    const posted = documents > documentsBefore
    await page.waitForTimeout(300)
    const first = posted ? [] : await page.evaluate(() => window.__first)
    return {
      ...boot,
      shown,
      posted,
      delay: first[0]?.delay ?? Number.NaN,
      duration: first[0]?.duration ?? Number.NaN,
      scripts: scriptsBeforePress,
      problems,
    }
  } finally {
    await context.close()
  }
}

const scriptBytes = async urls => {
  const each = []
  for (const url of urls) {
    const text = await (await fetch(url)).text()
    each.push({ file: new URL(url).pathname, raw: bytes(text), brotli: brotli(text) })
  }
  each.sort((a, b) => b.brotli - a.brotli)
  return {
    files: each.length,
    raw: each.reduce((sum, file) => sum + file.raw, 0),
    brotli: each.reduce((sum, file) => sum + file.brotli, 0),
    each,
  }
}

/** Median, least and most of the runs, and how far apart those two are: the noise a difference must exceed. */
const summary = values => {
  const { n, median, max } = spread(values)
  const min = Math.min(...values.filter(Number.isFinite))
  const round = value => Math.round(value * 10) / 10
  return n === 0
    ? { n }
    : { n, median: round(median), min: round(min), max: round(max), range: round(max - min) }
}

const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim()

const main = async () => {
  if (!process.argv.includes('--no-build')) await buildApp()
  const server = await serve()
  const browser = await chromium.launch()
  try {
    // The page is kept before the first run, so no server render is in any figure.
    const page = await pageBytes(server.origin)
    const runs = { rest: [], load: [] }
    for (let rep = -warmups; rep < reps; rep++) {
      for (const at of rep % 2 === 0 ? ['rest', 'load'] : ['load', 'rest']) {
        const run = await loadOnce(browser, server.origin, at)
        if (rep >= 0) runs[at].push(run)
      }
    }
    const all = [...runs.rest, ...runs.load]
    const problems = all.flatMap(run => run.problems)
    if (problems.length > 0) throw new Error(`the page reported:\n${problems.join('\n')}`)
    const urls = new Set(runs.rest.flatMap(run => run.scripts))
    const of = (kind, key) => summary(runs[kind].map(run => run[key]))
    const result = {
      commit: git('rev-parse', '--short', 'HEAD'),
      uncommitted: git('status', '--short', '--', 'examples/foldkit/domains-plus', 'packages')
        .split('\n')
        .filter(line => line !== ''),
      environment: { ...environment(browser), cpuThrottle: throttle, reps, warmups },
      page: PAGE,
      bytes: { page, scriptBeforeTakeover: await scriptBytes(urls) },
      boot: {
        blockingMs: of('rest', 'blocking'),
        blockingOver50Ms: of('rest', 'over50'),
        longestTaskMs: of('rest', 'longest'),
        longTasks: of('rest', 'tasks'),
        takeoverMs: of('rest', 'takeover'),
        servedElements: of('rest', 'served'),
        rebuiltElements: of('rest', 'rebuilt'),
        ...(phases
          ? {
              viewBeforeTakeoverMs: of('rest', 'view'),
              patchBeforeTakeoverMs: of('rest', 'patch'),
              updateBeforeTakeoverMs: of('rest', 'update'),
            }
          : {}),
      },
      press: Object.fromEntries(
        ['rest', 'load'].map(kind => [
          kind,
          {
            interaction: PRESS,
            posted: runs[kind].filter(run => run.posted).length,
            inputDelayMs: of(kind, 'delay'),
            toNextPaintMs: of(kind, 'duration'),
            toCartShownMs: of(kind, 'shown'),
          },
        ]),
      ),
    }
    console.log(JSON.stringify(result, null, 2))
    if (out !== undefined) writeFileSync(out, `${JSON.stringify({ ...result, runs })}\n`)
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
