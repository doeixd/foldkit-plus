import { defineConfig } from 'vite'

export default defineConfig({
  // Workspace packages resolve to their source, so an edit shows without a build.
  // `worker` too: the sandbox's SharedWorker parses Markdown, and micromark's
  // `decode-named-character-reference` builds a DOM element on load in its
  // `browser` build, which a worker has none of. Its `worker` build serves both.
  resolve: { conditions: ['foldkit-plus:source', 'worker'] },
  // The sandbox's server is a module SharedWorker.
  worker: { format: 'es' },
  build: { target: 'es2022' },
  // Its SQLite loads its WebAssembly beside it, which pre-bundling would lose.
  optimizeDeps: { exclude: ['@effect/wa-sqlite', '@effect/sql-sqlite-wasm'] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // The page connects to `/sync` on its own origin; proxy the WebSocket to the journal.
    proxy: { '/sync': { target: 'ws://127.0.0.1:8787', ws: true } },
  },
})
