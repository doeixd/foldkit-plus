import { defineConfig } from 'vite'

export default defineConfig({
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  // The server is a module SharedWorker, the same in `pnpm dev` and the build.
  worker: { format: 'es' },
  build: { target: 'es2022' },
  server: { host: '127.0.0.1', port: 5181 },
})
