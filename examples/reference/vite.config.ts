import { foldkit } from '@foldkit/vite-plugin'
import { foundations } from 'foldkit-plus/mixins/foundations'
import { defineConfig, type Plugin, type UserConfig } from 'vite'
import { BUILD_META } from './src/build.js'

/**
 * Writes the build's id into `index.html`, where the Worker reads it from
 * the template it renders into. The client's copy is compiled in by the
 * `foldkit` plugin, so a deploy cannot pair a Worker with another build's page.
 */
const buildMeta = (buildId: string): Plugin => ({
  name: 'reference-build-id',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { name: BUILD_META, content: buildId }, injectTo: 'head' },
  ],
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
export default defineConfig(configFor(crypto.randomUUID()))
