/**
 * Builds the fixture site through the `staticSite` plugin: a real `vite
 * build` of `fixture-site`, returning the absolute output directory. Each
 * caller passes its own directory, since test files may build in parallel.
 */
import { join } from 'node:path'
import { build } from 'vite'
import { staticSite } from 'foldkit-ssr/vite'
import { dir } from './fixtureDir.js'
import { buildId } from './fixture-site/src/app.js'

export const buildFixtureSite = async (outDir: string): Promise<string> => {
  await build({
    configFile: false,
    root: dir,
    logLevel: 'silent',
    // The build id the pages carry, as the deployment names it.
    define: { 'import.meta.env.FOLDKIT_BUILD_ID': JSON.stringify(buildId) },
    resolve: { conditions: ['foldkit-plus:source'] },
    build: { outDir, emptyOutDir: true },
    plugins: [staticSite({ site: { module: '/src/site.ts' } })],
  })
  return join(dir, outDir)
}
