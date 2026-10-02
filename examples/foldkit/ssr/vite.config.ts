import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
  server: { host: '127.0.0.1' },
  // The dev server renders each page through `src/entry.server.ts`, so
  // development serves the same pages production does, with the server's code
  // reloaded on edit; `FOLDKIT_BUILD_ID` in the environment names the build.
  plugins: [foldkit({ ssr: { serverEntry: '/src/entry.server.ts' } })],
})
