import { defineConfig } from 'vite'

export default defineConfig({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  // The sandbox's server is a module SharedWorker.
  worker: { format: 'es' },
  build: { target: 'es2022' },
  // Its SQLite loads its WebAssembly beside it, which pre-bundling would lose.
  optimizeDeps: { exclude: ['@effect/wa-sqlite', '@effect/sql-sqlite-wasm'] },
  server: {
    host: '127.0.0.1',
    port: 5175,
    // The client reads at `/remote` and exchanges edits at `/sync`, on its own
    // origin; both go to the server.
    proxy: {
      '/remote': { target: 'http://127.0.0.1:8789' },
      '/sync': { target: 'ws://127.0.0.1:8789', ws: true },
    },
  },
})
