// @vitest-environment node
/**
 * A page that draws only an Avatar ships only the Avatar, built as this
 * package publishes it. Linked into one file, `Recipes` became an object
 * whose getters reached every recipe, so `Recipes.Avatar` brought the whole
 * package, @foldkit/ui and floating-ui into the page (#241).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build as buildPackage } from 'tsdown'
import { build as buildPage } from 'vite'
import { afterAll, expect, test } from 'vitest'
import config from '../tsdown.config.js'

const packageDir = resolve(import.meta.dirname, '..')
// Inside the package, so the built files resolve its dependencies.
mkdirSync(join(packageDir, '.tsbuild'), { recursive: true })
const out = mkdtempSync(join(packageDir, '.tsbuild', 'tree-shaking-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

/** Every module a page bundle of `source` keeps, importing the built package as `ui`. */
const keptBy = async (name: string, source: string): Promise<ReadonlyArray<string>> => {
  const entry = join(out, `${name}.ts`)
  writeFileSync(entry, source)
  const result = await buildPage({
    configFile: false,
    logLevel: 'silent',
    root: out,
    resolve: { alias: { ui: join(out, 'dist/index.js') }, conditions: ['foldkit-plus:source'] },
    build: { write: false, minify: false, lib: { entry, formats: ['es'], fileName: name } },
  })
  const outputs = [result].flat().flatMap(built => ('output' in built ? built.output : []))
  return outputs.flatMap(chunk =>
    chunk.type === 'chunk'
      ? Object.entries(chunk.modules)
          .filter(([, module]) => module.renderedLength > 0)
          .map(([id]) => id.replaceAll('\\', '/'))
      : [],
  )
}

const upstream = (id: string) => /\/@foldkit\/ui\/|\/@floating-ui\//.test(id)

test('an Avatar and its recipe keep no other component', async () => {
  await buildPackage({
    ...config,
    config: false,
    cwd: packageDir,
    outDir: join(out, 'dist'),
    dts: false,
    logLevel: 'silent',
  })
  const [avatar, everything] = await Promise.all([
    keptBy(
      'avatar',
      `import { Avatar, AvatarSlots, Recipes } from 'ui'
export const avatar = [Avatar.view, AvatarSlots, Recipes.Avatar({ color: 'name' })]`,
    ),
    keptBy('everything', `export * as UI from 'ui'`),
  ])
  const ours = (kept: ReadonlyArray<string>) =>
    kept.flatMap(id => (id.startsWith(`${out.replaceAll('\\', '/')}/dist/`) ? [id] : []))
  expect(ours(avatar).some(id => id.endsWith('/dist/recipes/avatar.js'))).toBe(true)
  expect(ours(avatar).filter(id => /\/dist\/(recipes\/)?popover\.js$/.test(id))).toEqual([])
  expect(avatar.filter(upstream)).toEqual([])
  // The same walk sees @foldkit/ui where the package does reach it.
  expect(everything.some(upstream)).toBe(true)
}, 120_000)
