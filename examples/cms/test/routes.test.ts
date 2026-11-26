// @vitest-environment node
/**
 * What each screen loads first, from a build against the packages' `dist` as an installed
 * application gets it (`scripts/bundle-report.mjs --route`): the entry, plus the chunk of the
 * application the address asks for. The studio carries the rich-text editor, its toolbar and the
 * form that holds them; the public site carries none of it, only the Markdown reader that draws a
 * post, so a reader of the blog does not pay for the editor.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'

const dir = resolve(import.meta.dirname, '..')
const script = resolve(import.meta.dirname, '../../../scripts/bundle-report.mjs')

// Brotli bytes, from the build this was set against: each ceiling is the reading plus about 2%,
// rounded up to the next 500 bytes. Never raise one without saying here what the growth bought.
// studio +5,568 on 2026-11-22, permanent: 377,768 measured after step 10 of the metakit unification plan
// (379,562 before it, in one tree; it read 379,499 to 379,607 since step 5 and the ceiling was never
// raised for it). The entry it loads carries metakit's evaluator and judge, as every page that reaches
// entity does (15.9 kB minified), accepted by the maintainer on 2026-11-21. Ceiling: the reading plus 300.
// site +3,614 on 2026-11-22, permanent: 331,814 measured after step 10 (333,714 before it, in one tree),
// over since step 5 for the same reason. Ceiling: the reading plus 300.
// studio +4,432 on 2026-11-26 (CI read 382,052): metakit's core evaluator/judge growth (Sets,
// Domain.Id/Ordinal, Pipeable/Inspectable) and foldkit-remote IVM/Effect integration carried by
// the shared entry and studio chunk. Ceiling: CI's reading plus ~400, rounded up.
const CEILINGS = { studio: 382_500, site: 332_114 }

/** Strings only the editor's code writes: its form control's kind, its toolbar's keys. */
const EDITOR = ['RichTextInput', 'FormattingToolbarKeys']

interface Manifest {
  readonly [key: string]: {
    readonly file: string
    readonly src?: string
    readonly isEntry?: boolean
    readonly imports?: ReadonlyArray<string>
  }
}

test('the public site loads no editor, and each screen loads what it shows within its budget', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'cms-routes-'))
  try {
    const json = join(scratch, 'report.json')
    const dump = join(scratch, 'client')
    execFileSync(
      process.execPath,
      [
        script,
        dir,
        '--json',
        json,
        '--dump',
        dump,
        '--route',
        'studio=src/apps/studioApp.ts',
        '--route',
        'site=src/apps/siteApp.ts',
        '--landing',
        'studio',
      ],
      { stdio: 'pipe' },
    )
    const report = JSON.parse(readFileSync(json, 'utf8')) as {
      readonly routes: ReadonlyArray<{
        readonly name: string
        readonly firstLoadBrotli: number
        readonly split: boolean
      }>
    }
    const manifest = JSON.parse(
      readFileSync(join(dump, '.vite', 'manifest.json'), 'utf8'),
    ) as Manifest
    const chunks = Object.values(manifest)
    const entry = chunks.find(chunk => chunk.isEntry === true)
    expect(entry).toBeDefined()
    const loadedBy = (suffix: string): ReadonlySet<string> => {
      const root = chunks.find(chunk => chunk.src?.endsWith(suffix))
      expect(root, `${suffix} is a chunk of its own`).toBeDefined()
      const seen = new Set<string>()
      const visit = (chunk: Manifest[string] | undefined) => {
        if (chunk === undefined || seen.has(chunk.file)) return
        seen.add(chunk.file)
        for (const key of chunk.imports ?? []) visit(manifest[key])
      }
      visit(entry)
      visit(root)
      return seen
    }
    const holds = (files: ReadonlySet<string>, text: string) =>
      [...files].some(file => readFileSync(join(dump, file), 'utf8').includes(text))
    const studio = loadedBy('apps/studioApp.ts')
    const site = loadedBy('apps/siteApp.ts')

    // The check can fail: the studio's load does hold the editor.
    for (const text of EDITOR) {
      expect(holds(studio, text), `the studio loads ${text}`).toBe(true)
      expect(holds(site, text), `the site loads ${text}`).toBe(false)
    }
    for (const route of report.routes) {
      expect(route.split, `${route.name} is split off the entry`).toBe(true)
      const ceiling = CEILINGS[route.name as keyof typeof CEILINGS]
      const message = `${route.name} first load: ${route.firstLoadBrotli} brotli bytes against ${ceiling}`
      expect(route.firstLoadBrotli, message).toBeLessThanOrEqual(ceiling)
      expect(route.firstLoadBrotli, message).toBeGreaterThan(ceiling * 0.9)
    }
    expect(readdirSync(dump).length).toBeGreaterThan(0)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}, 300_000)
