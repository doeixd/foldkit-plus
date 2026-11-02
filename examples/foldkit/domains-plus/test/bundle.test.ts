// @vitest-environment node
/**
 * The client's size budget (#421): the brotli JavaScript the search page loads
 * at start, from a build against the packages' `dist` as an installed
 * application gets it (`scripts/bundle-report.mjs`, which prints the table by
 * package).
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'
import { buildClient, formatReport, reportFor } from '../../../../scripts/bundle-report.mjs'
import { record } from '../../../../scripts/perf-report.mjs'

// Brotli bytes. Lower it as #419, #420, #422 and #423 land: never raise it
// without saying here what the growth bought. 213.9 kB measured on 2026-11-02
// with the sheets' views in a chunk of their own (#423): they were worth 0.9 kB,
// the rest of the Sheet (its update and Swipe) is one module of foldkit-mixins-ui.
const CEILING = 215_000

const root = resolve(import.meta.dirname, '..')

/** The source files a built chunk holds, from its source map. */
const sourcesOf = (client: string, file: string): ReadonlyArray<string> =>
  JSON.parse(readFileSync(join(client, `${file}.map`), 'utf8')).sources.map((source: string) =>
    source.replaceAll('\\', '/'),
  )

type Manifest = Record<
  string,
  { file: string; src?: string; isEntry?: boolean; imports?: Array<string> }
>

test('the search page loads at most the budgeted brotli JavaScript, without the sheets (#423)', async () => {
  const built = await buildClient(root)
  try {
    const report = reportFor(built.client, root)
    expect(report.total.chunks).toBeGreaterThan(0)
    record({
      kind: 'size',
      name: 'domains-plus client JS, brotli',
      value: report.total.brotli,
      budget: CEILING,
    })
    const message = `${formatReport(report)}\n\nbudget: ${CEILING} bytes`
    expect(report.total.brotli, message).toBeLessThanOrEqual(CEILING)
    // A drop of more than 10% means the ceiling is stale: lower it.
    expect(report.total.brotli, message).toBeGreaterThan(CEILING * 0.9)

    // The cart's and the phone's sheets are a chunk of their own: the first
    // chunks hold none of their modules, and that chunk holds them (a size
    // alone passes when the import is static and something else shrank).
    const manifest: Manifest = JSON.parse(
      readFileSync(join(built.client, '.vite', 'manifest.json'), 'utf8'),
    )
    const loadedAtStart = new Set<string>()
    const visit = (key: string) => {
      const chunk = manifest[key]
      if (chunk === undefined || loadedAtStart.has(chunk.file)) return
      loadedAtStart.add(chunk.file)
      chunk.imports?.forEach(visit)
    }
    Object.entries(manifest).forEach(([key, chunk]) => chunk.isEntry === true && visit(key))
    const sheets = /\/src\/client\/(sheetViews|sheetStyle)\.ts$/
    const atStart = [...loadedAtStart].flatMap(file => sourcesOf(built.client, file))
    expect(atStart.filter(source => sheets.test(source))).toEqual([])

    const chunk = Object.values(manifest).find(entry => entry.src === 'src/client/sheetViews.ts')
    expect(chunk).toBeDefined()
    expect(loadedAtStart.has(chunk?.file ?? '')).toBe(false)
    expect(
      sourcesOf(built.client, chunk?.file ?? '').filter(source => sheets.test(source)),
    ).toHaveLength(2)
  } finally {
    built.cleanup()
  }
}, 300_000)
