import { defineConfig } from 'vite'

export default defineConfig({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // The page connects to `/sync` on its own origin; proxy the WebSocket to the journal.
    proxy: { '/sync': { target: 'ws://127.0.0.1:8787', ws: true } },
  },
})
