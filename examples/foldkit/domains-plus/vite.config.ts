import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'
// From source, by path: a config runs in Node, past the source condition.
import { styles } from '../../../packages/mixins/src/vite.ts'

export default defineConfig(({ command }) => {
  // One `vite build` makes the client and the Worker, which must agree on
  // the build's id, or the browser contains every page instead of resuming it.
  if (command === 'build') process.env.FOLDKIT_BUILD_ID ??= crypto.randomUUID()
  return {
    // Workspace packages resolve to their source, so an edit shows without a build.
    resolve: { conditions: ['foldkit-plus:source'] },
    ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
    server: { host: '127.0.0.1', port: 5191 },
    plugins: [
      // The theme and every class the app compiles, as one hashed file the pages link.
      styles({ sheet: '/src/client/style.ts' }),
      foldkit({
        ssr: {
          serverEntry: '/src/server/entry.ts',
          clientEntry: '/src/client/entry.ts',
          // Every page is rendered per request. A prerendered `/` would be the
          // file the static host serves for every `?q=`, whose box is empty
          // until the bundle runs; a render carries the query (#383). And
          // `prepare` reads the cart cookie, so `SSR.entry` refuses `/` as
          // prerendered: one file cannot hold each visitor's cart (#469).
          build: { prerender: false },
        },
      }),
    ],
    optimizeDeps: { entries: ['src/client/entry.ts'] },
  }
})
