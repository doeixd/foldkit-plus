// @vitest-environment node
/**
 * What each kind of page loads first, from a build against the packages' `dist` as an installed
 * application gets it (`scripts/bundle-report.mjs --route`): the entry, plus the chunk of the
 * application the address asks for. The site is two applications. A guide, an API page, the demos
 * and the home page take the first over (`shell.ts`); the component pages and the theme creator
 * take the second (`main.ts`), which adds the previews' state and every recipe to it. A reader of
 * a guide must not pay for the previews.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'

const dir = resolve(import.meta.dirname, '..')
const script = resolve(import.meta.dirname, '../../../scripts/bundle-report.mjs')

// Brotli bytes, from the build this was set against: each ceiling is the reading plus about 2%,
// rounded up to the next 500 bytes. Never raise one without saying here what the growth bought.
// 2026-11-16: the site was one start chunk of 372.8 kB for every page, the previews' state and
// code in it. Split in two: a guide page loads 184.2 kB, and a component page 385.5 kB, the 12.7
// kB more being the first application's own code beside the second's, loaded once per page.
// Later that day the component page grew 1.8 kB to 387.3 kB: the busy-until-taken-over flag, the Disclosure
// page (its snippet, state and recipe) and the accessibility notes' text, about 0.2 kB per page with notes.
// Then the Drawer and App shell pages (their snippets, the Drawer's state, notes and the frame) and the
// Input OTP states' own codes took it to 389.0 kB, 1.7 kB more; the ceiling is that plus 1%.
// 2026-11-17: the gallery's first load is 397.6 kB, +8.5 kB from the last green main (389.1 kB), built
// in separate trees: +5.3 kB the Primitives gallery's own code (its data, snippets and view, and the
// motion and net primitives its live examples run), +3.1 kB shared by the pages: `recipe.add`, the
// FileUpload and Calendar recipes and the default look's theme text. The shell grew 0.6 kB (the style
// runtime). Ceiling raised to the reading with the Combobox's options and rows (about 0.4 kB), rounded up.
// Later that day the example harness (#589) took the gallery from 398,242 to 399,746, both built
// from one tree with the site's sources swapped: +0.74 kB the harness itself (`define.ts`,
// `examplesState.ts`, `example.ts`, the line under a module's code and the Model field), +0.15 kB
// `configure` (first read here), and +0.6 kB net for the Button and Tags input pages as modules,
// which gained four examples (two `configure`, `recipe.add`, the layout Slots) and lost 0.56 kB of
// regions and hand-written folds.
// With the Combobox, Calendar and DatePicker modules and the new File upload page it reads
// 410,525, by the gallery chunk's modules against the same baseline build: +5.4 kB the FileUpload
// widget and its recipe (a page the site did not have), +2.9 kB the options-level views and
// states the modules draw through (`calendar/state`, `view` and `layout`, `datePicker/state` and
// `view`, `combobox/view`, the Bundles and `Bundle.compose`), +2.9 kB the thirty-one example
// modules, +0.9 kB the harness and `configure`, less 1.7 kB of regions no page draws any more.
// The adapter-rung regions of those three pages are still loaded beside the modules.
// 2026-11-18: the gallery reads 422,177 here and 423,286 on CI, +11.7 kB over the reading above,
// Not split module by module against the old build (no second tree); what the dump shows is the
// causes: the example modules of the button, surface, choice-control, menu and text-field pages
// (`configure.ts` 0.3 to 1.0 kB minified each, about two hundred modules in all, and the
// `snippets/components.ts` regions still loaded beside them), the recipes' new axis values, and the
// options-level modules (`calendar/state` 2.2 kB, `combobox/view` 1.6 kB, `bundles/*`, `configure`,
// `press`, `adornments`, `toggleRow`, `choice/*`, `words`). The component pages draw every widget,
// so each of those is one a preview draws; the shell (a guide's load, 173.5 kB) holds none of them.
// Ceiling raised to the reading plus about 0.3%, rounded up: 428,656 in a tree that also held the
// selection-popup, dialog, accordion and table families' uncommitted work (422,177 an hour earlier
// without it), so the next family to land re-measures and raises it by what it added.
// Later on 2026-11-18, with the layout, data-and-media and chat families (F9 to F11) in, it reads
// 443,558, +14.9 kB. By the gallery's modules (the gallery chunk marked as an entry and attributed
// by `reportFor`): the 130 example modules of those families' pages come to about 15.4 kB
// (layout 7.8, data and media 5.6, chat 2.0), less the regions they replaced; their recipes,
// Bundles and preview lists are 18.8 kB of the total (not compared with a build before them). The gallery Model's fields
// for converted pages (`widgets.ts`, `widgetsUpdate.ts`, 3.6 kB) are still loaded until phase 5
// deletes them. Ceiling: the reading plus about 0.3%, rounded up.
const CEILINGS = { shell: 188_000, gallery: 445_000 }

/** Strings only the previews' state writes: the ids its widgets are initialised with. */
const PREVIEWS = ['preview-drop', 'preview-trip']

interface Manifest {
  readonly [key: string]: {
    readonly file: string
    readonly src?: string
    readonly isEntry?: boolean
    readonly imports?: ReadonlyArray<string>
  }
}

test('a guide loads no preview code, and each kind of page loads what it shows within its budget', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'site-routes-'))
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
        'shell=src/entryShell.ts',
        '--route',
        'gallery=src/entryGallery.ts',
        '--landing',
        'shell',
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
    const shell = loadedBy('entryShell.ts')
    const gallery = loadedBy('entryGallery.ts')

    // The check can fail: the component pages do hold the previews' state.
    for (const text of PREVIEWS) {
      expect(holds(gallery, text), `the component pages load ${text}`).toBe(true)
      expect(holds(shell, text), `a guide loads ${text}`).toBe(false)
    }
    for (const route of report.routes) {
      expect(route.split, `${route.name} is split off the entry`).toBe(true)
      const ceiling = CEILINGS[route.name as keyof typeof CEILINGS]
      const message = `${route.name} first load: ${route.firstLoadBrotli} brotli bytes against ${ceiling}`
      expect(route.firstLoadBrotli, message).toBeLessThanOrEqual(ceiling)
      expect(route.firstLoadBrotli, message).toBeGreaterThan(ceiling * 0.9)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}, 300_000)
