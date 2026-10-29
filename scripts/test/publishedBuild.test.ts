// @vitest-environment node
/**
 * A page pays for a published package what it pays for the package's source
 * (#215). Each package is built with its own `tsdown.config.ts`, and a page
 * reading one export is bundled twice: against that build, and against the
 * source. Linked into one file, a build kept far more than the source did:
 * `sideEffects: false` drops whole files, and a linked package is one file,
 * while its `export * as` namespaces became objects whose getters keep every
 * member (#241).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build as buildPackage, type UserConfig } from 'tsdown'
import { build as buildPage } from 'vite'
import { afterAll, expect, test } from 'vitest'

const packages = resolve(import.meta.dirname, '..', '..', 'packages')
const made: Array<string> = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** The bytes a page keeps from files under `dir`, importing `entry` as `pkg`. */
const keptFrom = async (root: string, entry: string, dir: string): Promise<number> => {
  const result = await buildPage({
    configFile: false,
    logLevel: 'silent',
    root,
    resolve: { alias: { pkg: entry }, conditions: ['foldkit-plus:source'] },
    build: {
      write: false,
      minify: false,
      lib: { entry: join(root, 'page.ts'), formats: ['es'], fileName: 'page' },
    },
  })
  const prefix = dir.replaceAll('\\', '/')
  return [result]
    .flat()
    .flatMap(built => ('output' in built ? built.output : []))
    .flatMap(chunk => (chunk.type === 'chunk' ? Object.entries(chunk.modules) : []))
    .filter(([id]) => id.replaceAll('\\', '/').startsWith(prefix))
    .reduce((sum, [, module]) => sum + module.renderedLength, 0)
}

/**
 * Each package a page loads, with a page that reads a small part of it. The
 * published build writes the same code a little differently (about 30 bytes
 * here), so it may keep 5% more than the source; linked, it kept from a third
 * more (ssr) to 39 times as much (entity).
 */
const cases: ReadonlyArray<readonly [name: string, page: string]> = [
  ['mixins', `import { Behaviors } from 'pkg'\nexport const used = Behaviors.Disclosure`],
  ['bundle', `import { Resource } from 'pkg'\nexport const used = Resource.lazy`],
  ['media', `import { Icon } from 'pkg'\nexport const used = Icon.draw`],
  ['entity', `import { Collation } from 'pkg'\nexport const used = Collation.binary`],
  ['primitives', `import { Motion } from 'pkg'\nexport const used = Motion.reduced`],
  ['crud', `import { Sort } from 'pkg'\nexport const used = Sort`],
  ['form', `import { Input } from 'pkg'\nexport const used = Input`],
  ['ssr', `import { metaMarkup } from 'pkg'\nexport const used = metaMarkup`],
]

test.each(cases)(
  'a page keeps no more of the published %s than of its source',
  async (name, page) => {
    const packageDir = join(packages, name)
    // Inside the package, so the built files resolve its dependencies.
    mkdirSync(join(packageDir, '.tsbuild'), { recursive: true })
    const root = mkdtempSync(join(packageDir, '.tsbuild', 'published-'))
    made.push(root)
    writeFileSync(join(root, 'page.ts'), page)
    const config: UserConfig = (await import(`../../packages/${name}/tsdown.config.ts`)).default
    await buildPackage({
      ...config,
      config: false,
      cwd: packageDir,
      outDir: join(root, 'dist'),
      dts: false,
      logLevel: 'silent',
    })
    // Where the package's manifest sends an import, so the check reads the
    // file a consumer gets.
    const manifest: { readonly exports: { readonly '.': { readonly import: string } } } =
      JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    const imported = manifest.exports['.'].import
    const source = await keptFrom(
      root,
      join(packageDir, 'src', 'index.ts'),
      join(packageDir, 'src'),
    )
    const published = await keptFrom(root, join(root, imported), join(root, 'dist'))
    expect(source).toBeGreaterThan(0)
    expect(published).toBeLessThanOrEqual(source * 1.05)
  },
  120_000,
)
