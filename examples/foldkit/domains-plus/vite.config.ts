import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'
// From source, by path: a config runs in Node, past the source condition.
import { styles } from '../../../packages/mixins/src/vite.ts'
import { runtimeChunk } from '../../../packages/ssr/src/runtimeChunk.ts'

export default defineConfig(({ command }) => {
  // One `vite build` makes the client and the Worker, which must agree on
  // the build's id, or the browser contains every page instead of resuming it.
  if (command === 'build') process.env.FOLDKIT_BUILD_ID ??= crypto.randomUUID()
  // Opt-in (#472): the page loads `foldkit-ssr/loader`, and the plan starts
  // idle. Not the default until its first press, Total Blocking Time and
  // total script are measured against today's entry.
  const loader = process.env.DOMAINS_PLUS_LOADER === '1'
  return {
    define: { 'import.meta.env.DOMAINS_PLUS_LOADER': JSON.stringify(loader ? '1' : '') },
    // Workspace packages resolve to their source, so an edit shows without a build.
    resolve: { conditions: ['foldkit-plus:source'] },
    ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
    server: { host: '127.0.0.1', port: 5191 },
    plugins: [
      // The theme and every class the app compiles, as one hashed file the pages link.
      // Only the tokens the sheet reads (#487): no view here reads one inline;
      // `look.browser.test.ts` checks the page draws the same. `style.ts`
      // ships as the classes it compiles to, not the compiler (#420).
      styles({ sheet: '/src/server/sheet.ts', prune: {}, modules: ['/src/client/style.ts'] }),
      foldkit({
        ssr: {
          serverEntry: '/src/server/entry.ts',
          clientEntry: loader ? '/src/client/loader.ts' : '/src/client/entry.ts',
          // Every page is rendered per request. A prerendered `/` would be the
          // file the static host serves for every `?q=`, whose box is empty
          // until the bundle runs; a render carries the query (#383). And
          // `prepare` reads the cart cookie, so `SSR.entry` refuses `/` as
          // prerendered: one file cannot hold each visitor's cart (#469).
          build: { prerender: false },
        },
      }),
      ...(loader ? [runtimeChunk({ entry: '/src/client/entry.ts' })] : []),
    ],
    optimizeDeps: { entries: ['src/client/entry.ts'] },
  }
})
