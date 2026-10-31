/**
 * Builds a package as it is published and bundles a page against it, so a
 * test can read what a page keeps of the build rather than of the source.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build as buildPackage, type UserConfig } from 'tsdown'
import { build as buildPage, type Alias } from 'vite'

export const packages = resolve(import.meta.dirname, '..', '..', 'packages')

/** A fresh folder inside the package, so files built there resolve its dependencies. */
export const scratchIn = (name: string, prefix: string): string => {
  const tsbuild = join(packages, name, '.tsbuild')
  mkdirSync(tsbuild, { recursive: true })
  return mkdtempSync(join(tsbuild, prefix))
}

/**
 * Builds the package with its own `tsdown.config.ts` into `root/dist`, and
 * returns the file its manifest sends an import of `.` to there: the file a
 * consumer gets.
 */
export const buildPublished = async (name: string, root: string): Promise<string> => {
  const packageDir = join(packages, name)
  const config: UserConfig = (await import(`../../packages/${name}/tsdown.config.ts`)).default
  await buildPackage({
    ...config,
    config: false,
    cwd: packageDir,
    outDir: join(root, 'dist'),
    dts: false,
    logLevel: 'silent',
  })
  const manifest: { readonly exports: { readonly '.': { readonly import: string } } } = JSON.parse(
    readFileSync(join(packageDir, 'package.json'), 'utf8'),
  )
  return join(root, manifest.exports['.'].import)
}

/** Each module a page bundled from `root/page.ts` keeps, by its path with `/` separators. */
export const pageModules = async (
  root: string,
  page: string,
  alias: ReadonlyArray<Alias>,
): Promise<ReadonlyArray<{ readonly id: string; readonly length: number }>> => {
  writeFileSync(join(root, 'page.ts'), page)
  const result = await buildPage({
    configFile: false,
    logLevel: 'silent',
    root,
    resolve: { alias: [...alias], conditions: ['foldkit-plus:source'] },
    build: {
      write: false,
      // What a page pays: unminified, a published module's doc comment, which
      // the source build drops, outweighed a small page (mixins-builder).
      minify: true,
      lib: { entry: join(root, 'page.ts'), formats: ['es'], fileName: 'page' },
    },
  })
  return [result]
    .flat()
    .flatMap(built => ('output' in built ? built.output : []))
    .flatMap(chunk => (chunk.type === 'chunk' ? Object.entries(chunk.modules) : []))
    .map(([id, module]) => ({ id: id.replaceAll('\\', '/'), length: module.renderedLength }))
}
