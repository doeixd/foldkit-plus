/**
 * Phase G6: `bench/manifest.ts`'s timing in Chromium rather than jsdom, whose
 * DOM is several times slower than a browser's, so its numbers overstate the
 * marker scan. Each page is rendered here, loaded into a headless Chromium,
 * and timed there with the same `timeOnPage`, bundled by esbuild; medians of
 * ten runs after two warm-ups.
 *
 * Needs a Chromium that `playwright-core` can launch: set
 * `PLAYWRIGHT_BROWSERS_PATH`, or `CHROMIUM` to the executable.
 *
 * Run: pnpm bench:manifest:browser
 */
import { fileURLToPath } from 'node:url'
import { Effect } from 'effect'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { SSR } from 'foldkit-ssr'
import { configFor, median, plan, template } from './manifestApp.js'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

const main = async () => {
  const bundled = await build({
    entryPoints: [here('./manifestBrowserEntry.ts')],
    tsconfig: here('../tsconfig.json'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    // Foldkit reads Vite's dev flag; a production page has none.
    define: { 'import.meta.hot': 'undefined' },
  })
  const script = bundled.outputFiles[0]!.text
  const browser = await chromium.launch(
    process.env.CHROMIUM === undefined ? {} : { executablePath: process.env.CHROMIUM },
  )
  const page = await browser.newPage()
  console.log('| rows | decode | listen | together |')
  console.log('| ---: | ---: | ---: | ---: |')
  for (const count of [10, 100, 1_000]) {
    const html = SSR.page(
      template,
      await Effect.runPromise(SSR.render(configFor(count), plan, { buildId: 'bench' })),
    )
    const runs: Array<{ readonly decode: number; readonly listen: number }> = []
    for (let run = 0; run < 12; run++) {
      await page.setContent(html)
      await page.addScriptTag({ content: script })
      runs.push(
        await page.evaluate(() =>
          (
            globalThis as unknown as { timeOnPage: () => { decode: number; listen: number } }
          ).timeOnPage(),
        ),
      )
    }
    const decode = median(runs.map(run => run.decode))
    const listen = median(runs.map(run => run.listen))
    const together = median(runs.map(run => run.decode + run.listen))
    console.log(
      `| ${count} | ${decode.toFixed(1)} ms | ${listen.toFixed(1)} ms | ${together.toFixed(1)} ms |`,
    )
  }
  await browser.close()
}

void main()
