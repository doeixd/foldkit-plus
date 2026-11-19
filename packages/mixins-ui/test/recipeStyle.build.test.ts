// @vitest-environment node
/**
 * `Recipes.Table.style(selection)` costs a page no more than the two calls it
 * replaces, `Style.forSlots(TableSlots)(Recipes.Table(selection))`, and a
 * page that styles the table its own way still keeps no recipe. Built as
 * this package publishes it. Measured when it was added: 378,631 minified
 * bytes for one call against 378,650 for two, and the method itself added 47
 * bytes to every page, the own-styled one included, since `Style` keeps all
 * of `style.ts` wherever it is read.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import { build as buildPackage } from 'tsdown'
import { build as buildPage } from 'vite'
import { afterAll, expect, test } from 'vitest'
import config from '../tsdown.config.js'

const packageDir = resolve(import.meta.dirname, '..')
mkdirSync(join(packageDir, '.tsbuild'), { recursive: true })
const out = mkdtempSync(join(packageDir, '.tsbuild', 'recipe-style-build-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

/** The modules a minified page bundle of `source` keeps, and its brotli size. */
const pageOf = async (
  name: string,
  source: string,
): Promise<{
  readonly modules: ReadonlyArray<string>
  readonly bytes: number
  readonly brotli: number
}> => {
  const entry = join(out, `${name}.ts`)
  writeFileSync(entry, source)
  const result = await buildPage({
    configFile: false,
    logLevel: 'silent',
    root: out,
    resolve: { alias: { ui: join(out, 'dist/index.js') }, conditions: ['foldkit-plus:source'] },
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
        .map(([id]) => id.replaceAll('\\', '/'))
        .filter(id => !id.endsWith(`/${name}.ts`)),
    ),
    bytes: chunks.reduce((sum, chunk) => sum + chunk.code.length, 0),
    brotli: chunks.reduce((sum, chunk) => sum + brotliCompressSync(chunk.code).length, 0),
  }
}

const isRecipe = (id: string) => /\/dist\/recipes\/[a-zA-Z]+\.js$/.test(id)

test('one call keeps what two calls keep, and an own style keeps no recipe', async () => {
  await buildPackage({
    ...config,
    config: false,
    cwd: packageDir,
    outDir: join(out, 'dist'),
    dts: false,
    logLevel: 'silent',
  })
  const [twoCalls, oneCall, own] = await Promise.all([
    pageOf(
      'twoCalls',
      `import { Style } from 'foldkit-mixins'
import { Recipes, Table, TableSlots } from 'ui'
export const page = [Table.view, Style.forSlots(TableSlots)(Recipes.Table({ rows: 'striped' }))]`,
    ),
    pageOf(
      'oneCall',
      `import { Recipes, Table } from 'ui'
export const page = [Table.view, Recipes.Table.style({ rows: 'striped' })]`,
    ),
    pageOf(
      'own',
      `import { Style } from 'foldkit-mixins'
import { Table, TableSlots } from 'ui'
export const page = [Table.view, Style.forSlots(TableSlots)({ table: Style.self({ inlineSize: '100%' }) })]`,
    ),
  ])
  expect(oneCall.modules.some(isRecipe)).toBe(true)
  expect([...oneCall.modules].sort()).toEqual([...twoCalls.modules].sort())
  expect(oneCall.bytes).toBeLessThanOrEqual(twoCalls.bytes)
  expect(own.modules.filter(isRecipe)).toEqual([])
}, 240_000)
