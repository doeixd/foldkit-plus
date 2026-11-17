import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  // Foldkit's view identity for the differ, and the Model kept across a dev reload.
  plugins: [foldkit()],
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  // Rolldown put its namespace helper in the entry chunk, and the `keys` chunk the entry imports
  // imported it back, so `keys` ran before the entry had defined it: the built page died with
  // "m is not a function" and drew nothing, while dev and every test passed. Neither a chunk
  // group (the helper's module is not offered to one) nor a loader-only entry (the helper moved
  // to the next entry) fixed it; this keeps each module's evaluation in import order.
  build: { rolldownOptions: { output: { strictExecutionOrder: true } } },
  server: { host: '127.0.0.1' },
})
