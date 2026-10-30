import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'

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
      foldkit({
        ssr: {
          serverEntry: '/src/server/entry.ts',
          clientEntry: '/src/client/entry.ts',
          // Every page is rendered per request: a prerendered `/` would be served
          // for `/?q=…` by the static host, and refused there (#373).
          build: { prerender: false },
        },
      }),
    ],
    optimizeDeps: { entries: ['src/client/entry.ts'] },
  }
})
