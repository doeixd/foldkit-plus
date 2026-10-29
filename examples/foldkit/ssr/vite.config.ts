import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
  // `start` serves the build from another process, which reads the id again,
  // so the two must be given one; a build without it would contain every page.
  if (command === 'build' && !process.env.FOLDKIT_BUILD_ID)
    throw new Error(
      'set FOLDKIT_BUILD_ID to the deployment being built; `start` needs the same value',
    )
  return {
    // Workspace packages resolve to their source, so an edit shows without a build.
    resolve: { conditions: ['foldkit-plus:source'] },
    ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
    server: { host: '127.0.0.1' },
    // The dev server renders each page through `src/entry.server.ts`, so
    // development serves the same pages production does, with the server's code
    // reloaded on edit. Unset, the plugin names a dev server's build `development`.
    plugins: [foldkit({ ssr: { serverEntry: '/src/entry.server.ts' } })],
  }
})
