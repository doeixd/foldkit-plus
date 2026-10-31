/**
 * `pnpm bench:render`: R1 of docs/design/foldkit-renderer-independence-PLAN.md,
 * what a render costs today. Builds the data grid demo (100,000 rows) and
 * domains-plus (556 extensions with live prices) for production with one
 * change, `slow` added to their runtime config with every budget below zero,
 * so Foldkit's own `slow` timings (`runtime/slowPhase.js`) report every
 * `update`, every `view` and every `patch` it runs. Each is served as it
 * ships (the grid by `vite preview`, domains-plus by `wrangler dev --local`
 * running its Worker), driven in headless Chromium through a set of
 * interactions, each repeated, and the frames each interaction caused are
 * summarized by the Message that triggered them.
 *
 * Usage: node scripts/render-baseline.mjs [--app grid|domains] [--reps 30]
 *   [--throttle 4] (Chromium's CPU slowed, as for a phone)
 *   [--out <file.json>] (every sample, with the environment)
 *
 * It fails when a scenario reports no `View` phase: the probe did not reach
 * the runtime, and the medians would be of nothing.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, platform, release, totalmem } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { build, createBuilder, preview } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}
const reps = Number(option('reps', '30'))
const warmups = 3
const only = option('app', undefined)
const out = option('out', undefined)
/** Chromium's CPU slowed by this factor (`Emulation.setCPUThrottlingRate`), as for a phone. */
const throttle = Number(option('throttle', '1'))

/**
 * Adds `slow` to the runtime config the app's entry passes, by text: the
 * one change made to the app. `anchor` must occur exactly once.
 */
const probe = (file, anchor) => ({
  name: 'render-baseline-probe',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith(file)) return undefined
    const parts = code.split(anchor)
    if (parts.length !== 2) this.error(`render-baseline: "${anchor.trim()}" is not once in ${file}`)
    return parts.join(`${anchor}    slow: Reflect.get(globalThis, '__renderBaseline'),\n`)
  },
})

/** Installed before the page's scripts: the `slow` config, recording every phase. */
const recorder = () => {
  const records = []
  const pathOf = message => {
    const tags = []
    for (let at = message; at !== null && typeof at === 'object' && typeof at._tag === 'string'; at = at.message)
      tags.push(at._tag)
    return tags.join('/')
  }
  // View and Patch carry an Option of the frame's last Message; Update carries the Message.
  const messageOf = context =>
    context._tag === 'Update' ? context.message : context.message?._tag === 'Some' ? context.message.value : undefined
  globalThis.__renderBaseline = {
    show: 'Always',
    measuredPhases: ['Update', 'View', 'Patch'],
    thresholdOverrides: { Update: -1, View: -1, Patch: -1 },
    onSlow: context =>
      records.push({ phase: context._tag, tag: pathOf(messageOf(context)), ms: context.durationMs, at: performance.now() }),
  }
  globalThis.__renderRecords = records
}

/** Waits until the runtime has reported nothing for `quietMs`, and returns what it reported. */
const settled = async (page, quietMs = 400) => {
  await page.waitForFunction(
    quiet => {
      const records = globalThis.__renderRecords
      const last = records.length === 0 ? 0 : records[records.length - 1].at
      return performance.now() - last > quiet
    },
    quietMs,
    { polling: 50, timeout: 60_000 },
  )
  return page.evaluate(() => globalThis.__renderRecords.splice(0))
}

/** The frames in a run of records: each `View` with the `Patch` after it. */
const framesOf = records => {
  const frames = []
  for (const [index, record] of records.entries()) {
    if (record.phase !== 'View') continue
    const patch = records.slice(index + 1).find(next => next.phase === 'Patch')
    frames.push({ tag: record.tag, view: record.ms, patch: patch?.ms ?? Number.NaN })
  }
  return frames
}

/**
 * Runs `act` `reps` times after `warmups` unrecorded ones, each to quiet,
 * and keeps every frame and update it caused.
 */
const scenario = async (page, name, act) => {
  for (let rep = 0; rep < warmups; rep++) {
    await act(rep)
    await settled(page)
  }
  const runs = []
  for (let rep = 0; rep < reps; rep++) {
    await act(rep)
    const records = await settled(page)
    runs.push({
      frames: framesOf(records),
      updates: records.filter(record => record.phase === 'Update').map(({ tag, ms }) => ({ tag, ms })),
    })
  }
  if (!runs.some(run => run.frames.length > 0))
    throw new Error(`${name}: no View phase reported; the slow probe did not reach the runtime`)
  return { name, runs }
}

const quantile = (sorted, q) => {
  if (sorted.length === 0) return Number.NaN
  const at = (sorted.length - 1) * q
  const below = Math.floor(at)
  const above = Math.ceil(at)
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below)
}
const spread = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  return {
    n: sorted.length,
    median: quantile(sorted, 0.5),
    p10: quantile(sorted, 0.1),
    p90: quantile(sorted, 0.9),
    max: sorted.at(-1) ?? Number.NaN,
  }
}
const ms = value => (Number.isFinite(value) ? value.toFixed(1) : '–')
const cell = ({ median, p10, p90 }) => `${ms(median)} (${ms(p10)}–${ms(p90)})`

/** One row per interaction and triggering Message: frames, view and patch, median (p10–p90) ms. */
const summarize = (app, results) => {
  const rows = []
  for (const { name, runs } of results) {
    const byTag = new Map()
    const updatesByTag = new Map()
    const add = (map, key, value) => {
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(value)
    }
    for (const run of runs) {
      for (const frame of run.frames) add(byTag, frame.tag, frame)
      for (const update of run.updates) add(updatesByTag, update.tag, update.ms)
    }
    for (const [tag, frames] of byTag) {
      const view = spread(frames.map(frame => frame.view))
      const patch = spread(frames.map(frame => frame.patch))
      const update = spread(updatesByTag.get(tag) ?? [])
      rows.push(
        `| ${app} | ${name} | \`${tag}\` | ${view.n} | ${cell(view)} | ${cell(patch)} | ${ms(view.max)} / ${ms(patch.max)} | ${ms(update.median)} |`,
      )
    }
  }
  return rows
}

/**
 * Where the Foldkit plugin writes the client and the Worker: it sets each
 * environment's `outDir` itself, so this runs after it, and the example's
 * own `dist` is left alone.
 */
const writeTo = outDir => ({
  name: 'render-baseline-out',
  enforce: 'post',
  config: () => ({
    environments: {
      client: { build: { outDir: join(outDir, 'client'), emptyOutDir: true } },
      ssr: { build: { outDir: join(outDir, 'server'), emptyOutDir: true } },
    },
  }),
})

/** A shell's child keeps workerd alive: end the whole tree. */
const stop = child => {
  if (platform() === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
  else child.kill('SIGTERM')
}

const scrollerTop = (page, selector, top) =>
  page.evaluate(([selector, top]) => {
    const element = document.querySelector(selector)
    if (element === null) throw new Error(`no ${selector}`)
    element.scrollTop = top
  }, [selector, top])

const apps = {
  grid: {
    root: join(root, 'examples', 'data-grid'),
    plugins: () => [probe('/examples/data-grid/src/entry.ts', '    devTools: { Message },\n')],
    serve: async (appRoot, outDir) => {
      const server = await preview({
        root: appRoot,
        configFile: join(appRoot, 'vite.config.ts'),
        build: { outDir },
        preview: { host: '127.0.0.1', port: 0, strictPort: false },
        logLevel: 'error',
      })
      return { origin: server.resolvedUrls.local[0].replace(/\/$/, ''), close: () => server.close() }
    },
    path: '/',
    ready: '[id="products:p2:price"]',
    scenarios: async page => {
      const cell = (row, column) => page.locator(`[id="products:${row}:${column}"]`)
      const height = await page.locator('#products').evaluate(element => element.clientHeight)
      return [
        // A click on a cell: the grid's focus moves, a row and a cell redraw.
        await scenario(page, 'select a cell', rep => cell(`p${2 + (rep % 4)}`, 'description').click()),
        // A page down the 100,000 rows and back: the window moves.
        await scenario(page, 'scroll a page', rep =>
          scrollerTop(page, '#products', rep % 2 === 0 ? height * (1 + (rep % 7)) : 0),
        ),
        // One price edited: the editor opens, a keystroke, the edit committed.
        await scenario(page, 'edit a cell', async rep => {
          // The scroll scenario may have left the window away from the first rows.
          await scrollerTop(page, '#products', 0)
          await cell('p2', 'price').click()
          // Enter meets the grid's last drawn frame: wait until it shows the cell active.
          await page.waitForFunction(
            () => document.querySelector('#products')?.getAttribute('aria-activedescendant') === 'products:p2:price',
          )
          await page.keyboard.press('Enter')
          await page.locator('#products input').waitFor()
          await page.keyboard.press('Control+A')
          await page.keyboard.type(`${10 + (rep % 50)}.50`)
          await page.keyboard.press('Enter')
        }),
      ]
    },
  },
  domains: {
    root: join(root, 'examples', 'foldkit', 'domains-plus'),
    environments: true,
    plugins: outDir => [
      probe('/examples/foldkit/domains-plus/src/client/entry.ts', '    container,\n'),
      writeTo(outDir),
    ],
    serve: async (appRoot, outDir) => {
      const port = 5197
      const config = join(outDir, 'wrangler.jsonc')
      writeFileSync(
        config,
        JSON.stringify({
          name: 'foldkit-domains-plus-render-baseline',
          main: './server/fetch.js',
          compatibility_date: '2026-10-19',
          compatibility_flags: ['new_module_registry', 'nodejs_compat', 'enable_request_signal', 'request_signal_passthrough'],
          assets: { directory: './client' },
        }),
      )
      const logFile = join(outDir, 'wrangler.log')
      const log = openSync(logFile, 'w')
      const child = spawn(
        `pnpm exec wrangler dev --local --config "${config}" --ip 127.0.0.1 --port ${port}`,
        { cwd: appRoot, shell: true, stdio: ['ignore', log, log] },
      )
      const origin = `http://127.0.0.1:${port}`
      for (let attempt = 0; ; attempt++) {
        if (attempt > 240 || child.exitCode !== null) {
          stop(child)
          throw new Error(`wrangler dev did not answer: see ${logFile}`)
        }
        const answered = await fetch(origin).then(response => response.ok, () => false)
        if (answered) break
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      return { origin, close: async () => stop(child) }
    },
    path: '/?q=acmeaa',
    ready: '.domain-card',
    scenarios: async page => {
      const search = page.getByRole('searchbox', { name: 'Search domains' })
      // 0 is the page's own "acmeaa".
      let queries = 1
      // The price of every row in view has arrived: the page is resting.
      await settled(page, 1500)
      return [
        // A keystroke: the query changes, the debounce settles it, the names
        // are checked again and each row in view reads its price.
        // Each run ends in a query not asked before (two letters after
        // "acme"), so its names and prices are read afresh: prices arrive.
        await scenario(page, 'type in search', async () => {
          const query = queries++
          const letter = index => String.fromCharCode(97 + (index % 26))
          await search.focus()
          await page.keyboard.press('End')
          await page.keyboard.press('Backspace')
          await page.keyboard.press('Backspace')
          await page.keyboard.type(`${letter(Math.floor(query / 26))}${letter(query)}`)
        }),
        // A viewport down All Results and back: rows come into view and read their prices.
        await scenario(page, 'scroll a page', rep =>
          page.evaluate(top => window.scrollTo(0, top), rep % 2 === 0 ? 900 * (1 + (rep % 5)) : 0),
        ),
        // The availability filter: the dropdown opened and an option chosen,
        // alternating Available and Show All, which reads the whole catalog.
        await scenario(page, 'toggle a filter', async rep => {
          await page.evaluate(() => window.scrollTo(0, 0))
          await page.locator('#availability-filter-button').click()
          await page.getByRole('option', { name: rep % 2 === 0 ? 'Available' : 'Show All' }).click()
        }),
      ]
    },
  },
}

const environment = browser => ({
  date: new Date().toISOString(),
  os: `${platform()} ${release()}`,
  cpu: `${cpus()[0]?.model ?? 'unknown'} × ${cpus().length}`,
  memoryGiB: Math.round(totalmem() / 2 ** 30),
  node: process.version,
  chromium: browser.version(),
  headless: true,
  viewport: '1440×900',
  cpuThrottle: throttle,
  reps,
  warmups,
})

const main = async () => {
  const browser = await chromium.launch()
  const results = {}
  const rows = []
  try {
    for (const [name, app] of Object.entries(apps)) {
      if (only !== undefined && only !== name) continue
      // Inside the app's own node_modules: prerendering imports the built
      // Worker, whose bare imports resolve from where it is written.
      const outDir = join(app.root, 'node_modules', '.render-baseline')
      rmSync(outDir, { recursive: true, force: true })
      mkdirSync(outDir, { recursive: true })
      const config = {
        root: app.root,
        configFile: join(app.root, 'vite.config.ts'),
        plugins: app.plugins(outDir),
        build: { outDir, emptyOutDir: true },
        logLevel: 'warn',
      }
      // As `vite build` does: an app whose config orchestrates its environments
      // (the Foldkit plugin's client, Worker and prerendering) builds them all.
      if (app.environments) await (await createBuilder(config)).buildApp()
      else await build(config)
      const server = await app.serve(app.root, outDir)
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
        await page.addInitScript(recorder)
        if (throttle !== 1)
          await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle })
        const problems = []
        page.on('pageerror', error => problems.push(String(error)))
        await page.goto(`${server.origin}${app.path}`)
        await page.locator(app.ready).first().waitFor({ timeout: 120_000 })
        await settled(page, 1000)
        results[name] = await app.scenarios(page)
        if (problems.length > 0) throw new Error(`${name} threw: ${problems.join('\n')}`)
        rows.push(...summarize(name, results[name]))
        await page.close()
      } finally {
        await server.close()
      }
    }
    const env = environment(browser)
    console.log(JSON.stringify(env, null, 2))
    console.log(
      "\n| app | interaction | frame's last Message | frames | view ms, median (p10–p90) | patch ms, median (p10–p90) | max view / patch | its update, median |",
    )
    console.log('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |')
    for (const row of rows) console.log(row)
    // Chromium reports whole tenths of a millisecond; the float noise below them is dropped.
    const tenths = (_, value) => (typeof value === 'number' ? Math.round(value * 10) / 10 : value)
    if (out !== undefined) writeFileSync(out, `${JSON.stringify({ environment: env, results }, tenths)}\n`)
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
