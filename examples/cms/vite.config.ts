import { defineConfig } from 'vite'

export default defineConfig({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  // The client waits for the published demo's in-page server at the top level.
  build: { target: 'es2022' },
  server: {
    host: '127.0.0.1',
    port: 5175,
    // The client posts to `/remote` on its own origin; proxy it to the server.
    proxy: { '/remote': { target: 'http://127.0.0.1:8789' } },
  },
})
