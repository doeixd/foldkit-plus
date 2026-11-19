// @vitest-environment node
/**
 * A page that draws a Breadcrumb ships no Menu: the Menu a folded trail opens
 * is `BreadcrumbMenu.make(...)`, a value the page passes (before, `collapse.menu`
 * imported Menu for every trail, about 21 kB brotli). Built as this package
 * publishes it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import { build as buildPage } from 'vite'
import { afterAll, expect, test } from 'vitest'
import { builtUiEntry } from './builtPackage.js'

const packageDir = resolve(import.meta.dirname, '..')
mkdirSync(join(packageDir, '.tsbuild'), { recursive: true })
const out = mkdtempSync(join(packageDir, '.tsbuild', 'breadcrumb-build-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

/** The modules a minified page bundle of `source` keeps, and its brotli size. */
const pageOf = async (
  name: string,
  source: string,
): Promise<{ readonly modules: ReadonlyArray<string>; readonly brotli: number }> => {
  const ui = await builtUiEntry()
  const entry = join(out, `${name}.ts`)
  writeFileSync(entry, source)
  const result = await buildPage({
    configFile: false,
    logLevel: 'silent',
    root: out,
    resolve: { alias: { ui }, conditions: ['foldkit-plus:source'] },
    build: { write: false, minify: true, lib: { entry, formats: ['es'], fileName: name } },
  })
  const chunks = [result]
    .flat()
    .flatMap(built => ('output' in built ? built.output : []))
    .flatMap(chunk => (chunk.type === 'chunk' ? [chunk] : []))
  return {
    modules: chunks.flatMap(chunk =>
      Object.entries(chunk.modules)
        .filter(([, module]) => module.renderedLength > 0)
        .map(([id]) => id.replaceAll('\\', '/')),
    ),
    brotli: chunks.reduce((sum, chunk) => sum + brotliCompressSync(chunk.code).length, 0),
  }
}

const isMenu = (id: string) => /\/dist\/(recipes\/)?menu(View|Utils)?\.js$/.test(id)

test('a trail with no Menu keeps none, and one given BreadcrumbMenu.make keeps it', async () => {
  const [plain, expand, withMenu] = await Promise.all([
    pageOf(
      'plain',
      `import { Breadcrumb } from 'ui'
export const trail = Breadcrumb.view`,
    ),
    pageOf(
      'expand',
      `import { Breadcrumb, BreadcrumbSlots, Recipes } from 'ui'
export const trail = [Breadcrumb.view, BreadcrumbSlots, Recipes.Breadcrumb({}), Breadcrumb.collapsedOf]`,
    ),
    pageOf(
      'menu',
      `import { Breadcrumb, BreadcrumbMenu } from 'ui'
export const trail = [Breadcrumb.view, BreadcrumbMenu.make]`,
    ),
  ])
  expect(plain.modules.filter(isMenu)).toEqual([])
  expect(expand.modules.filter(isMenu)).toEqual([])
  expect(withMenu.modules.some(isMenu)).toBe(true)
  // Measured: 68.4 kB without a Menu, 96.2 kB with one (brotli, the page minified).
  expect(withMenu.brotli - plain.brotli).toBeGreaterThan(10_000)
}, 120_000)
