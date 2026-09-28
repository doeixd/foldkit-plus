/**
 * Phase G4: the manifest's size and cost before anything is done about it.
 *
 * A keyed list of 10, 100 and 1,000 rows, three bindings each (a click, an
 * input with a hole, a focus), rendered against a plan. For each size it
 * prints the page's bytes, the envelope's, and the bindings' alone, raw and
 * gzipped, and the time `Resume.bindings` and `Resume.listen` take on the page
 * under jsdom (median of several runs, after a warm-up).
 *
 * The resumable design asks for action only if, at a thousand rows, the
 * gzipped bindings exceed a tenth of the gzipped page, or decoding and
 * listening together take more than one frame (16 ms).
 *
 * Run: pnpm bench:manifest
 */
import { gzipSync } from 'node:zlib'
import { Effect } from 'effect'
import { JSDOM } from 'jsdom'
import { SSR } from 'foldkit-ssr'
import { configFor, median, plan, template, timeOnPage } from './manifestApp.js'

const bytes = (text: string) => Buffer.byteLength(text, 'utf8')
const gzipped = (text: string) => gzipSync(text).byteLength

/** The page loaded into a fresh jsdom, with the globals `Resume.listen` reads. */
const loaded = (page: string) => {
  const dom = new JSDOM(page)
  const globals = globalThis as unknown as Record<string, unknown>
  for (const name of ['document', 'Element', 'HTMLElement', 'Event', 'KeyboardEvent']) {
    globals[name] = dom.window[name as keyof typeof dom.window]
  }
  return dom
}

const measure = async (count: number) => {
  const result = await Effect.runPromise(SSR.render(configFor(count), plan, { buildId: 'bench' }))
  const page = SSR.page(template, result)
  const manifest = JSON.stringify(
    JSON.parse(result.envelope.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')).bindings,
  )

  const runs: Array<{ readonly decode: number; readonly listen: number }> = []
  for (let run = 0; run < 12; run++) {
    const dom = loaded(page)
    runs.push(timeOnPage(dom.window.document))
    dom.window.close()
  }

  return {
    rows: count,
    bindings: count * 3,
    page: bytes(page),
    pageGz: gzipped(page),
    envelope: bytes(result.envelope),
    envelopeGz: gzipped(result.envelope),
    manifest: bytes(manifest),
    manifestGz: gzipped(manifest),
    decodeMs: median(runs.map(run => run.decode)),
    listenMs: median(runs.map(run => run.listen)),
  }
}

const kb = (value: number) => `${(value / 1024).toFixed(1)} KB`

const main = async () => {
  const rows: Array<Awaited<ReturnType<typeof measure>>> = []
  for (const count of [10, 100, 1_000]) rows.push(await measure(count))
  console.log(
    '| rows | bindings | page (gz) | envelope (gz) | bindings (gz) | bindings / page, gz | decode | listen |',
  )
  console.log('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const row of rows) {
    console.log(
      `| ${row.rows} | ${row.bindings} | ${kb(row.page)} (${kb(row.pageGz)}) | ${kb(row.envelope)} (${kb(row.envelopeGz)}) | ${kb(row.manifest)} (${kb(row.manifestGz)}) | ${((row.manifestGz / row.pageGz) * 100).toFixed(1)}% | ${row.decodeMs.toFixed(2)} ms | ${row.listenMs.toFixed(2)} ms |`,
    )
  }
}

void main()
