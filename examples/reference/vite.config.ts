import { foldkit } from '@foldkit/vite-plugin'
import { foundations } from 'foldkit-plus/mixins/foundations'
import { defineConfig, type Plugin, type UserConfig } from 'vite'
// By path, not `foldkit-plus/host`: Node loads a config's workspace imports past the
// source condition, and CI builds no `dist`. Vite bundles a relative import into the config.
import { buildTag } from '../../packages/host/src/template.js'

/**
 * Writes the build's id into `index.html`, where the Worker reads it from
 * the template it renders into (`Host.template`). The client's copy is compiled in by the
 * `foldkit` plugin, so a deploy cannot pair a Worker with another build's page.
 */
const buildMeta = (buildId: string): Plugin => ({
  name: 'reference-build-id',
  transformIndexHtml: () => [buildTag(buildId)],
})

/** The page's build: `dist/client`, which `wrangler.toml` serves as the Worker's assets. */
export const configFor = (buildId: string): UserConfig => ({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
  plugins: [
    // The theme in the template, so a page the Worker renders is styled from its first paint.
    foundations({ module: '/src/style.ts' }),
    foldkit({ buildId }),
    buildMeta(buildId),
  ],
  build: { outDir: 'dist/client', emptyOutDir: true },
})

// One build is one deployment: its id is new each time, and the Worker reads it from the build.
// `FOLDKIT_BUILD_ID` pins it, which the bundle budget needs to measure the same bytes twice (#490).
export default defineConfig(configFor(process.env.FOLDKIT_BUILD_ID ?? crypto.randomUUID()))
