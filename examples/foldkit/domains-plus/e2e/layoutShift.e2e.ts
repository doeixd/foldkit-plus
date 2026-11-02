/**
 * Cumulative layout shift of the built Worker at `/?q=sunbeam`, through load,
 * hydration and the prices arriving (#418), on a slowed CPU and link like
 * PageSpeed's. Each shift is printed with the nodes that moved; the budget is
 * Google's "good" line.
 *
 * Measured at HEAD (0.88 desktop, 0.67 phone), every shift was the page
 * painting unstyled: a render's `styles` ride at the root's tail, 242 KB into
 * the HTML, so the content paints before its rules arrive. With the same
 * `<style>` blocks moved into the head, the total is 0.001 on both.
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

const BUDGET = 0.1

interface Shift {
  readonly value: number
  readonly at: number
  readonly sources: ReadonlyArray<{
    readonly node: string
    readonly previous: ReadonlyArray<number>
    readonly current: ReadonlyArray<number>
  }>
}

const sizes = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const

// Fails until #419 puts the stylesheet in the head: today the server writes
// it at the end of the root, so the page paints unstyled first. #419 turns
// this into `test.each`.
test.fails.each(sizes)(
  'layout shift at $name stays under the budget (#418)',
  async size => {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.name === 'phone',
      isMobile: size.name === 'phone',
    })
    const page = await context.newPage()
    // PageSpeed's lab run: a slowed CPU and a slow 4G link, where hydration lands late.
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
    await page.addInitScript(() => {
      const describe = (node: Node | null): string => {
        if (!(node instanceof Element)) return node === null ? '(gone)' : '#text'
        const id = node.id === '' ? '' : `#${node.id}`
        const cls =
          typeof node.className === 'string' && node.className !== ''
            ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            : ''
        return `${node.tagName.toLowerCase()}${id}${cls}`
      }
      const rect = (r: DOMRectReadOnly) => [r.x, r.y, r.width, r.height].map(n => Math.round(n))
      const shifts: Array<unknown> = []
      ;(window as unknown as { __shifts: Array<unknown> }).__shifts = shifts
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number
            hadRecentInput: boolean
            sources: ReadonlyArray<{
              node: Node | null
              previousRect: DOMRectReadOnly
              currentRect: DOMRectReadOnly
            }>
          }
          if (shift.hadRecentInput) continue
          shifts.push({
            value: shift.value,
            at: Math.round(shift.startTime),
            sources: shift.sources.map(s => ({
              node: describe(s.node),
              previous: rect(s.previousRect),
              current: rect(s.currentRect),
            })),
          })
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    try {
      await page.goto(`${origin}/?q=sunbeam`, { waitUntil: 'load' })
      // Hydrated: Foldkit's stamp leaves the root.
      await expect
        .poll(() => page.locator('[data-foldkit-app]').count(), { timeout: 60_000 })
        .toBe(0)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)
      const shifts = (await page.evaluate(
        () => (window as unknown as { __shifts: unknown }).__shifts,
      )) as ReadonlyArray<Shift>
      const total = shifts.reduce((sum, shift) => sum + shift.value, 0)
      for (const shift of shifts)
        console.info(
          `${size.name} ${shift.value.toFixed(4)} at ${shift.at}ms ${JSON.stringify(shift.sources)}`,
        )
      console.info(`${size.name} CLS ${total.toFixed(4)}`)
      expect(total).toBeLessThan(BUDGET)
    } finally {
      await context.close()
    }
  },
  180_000,
)
