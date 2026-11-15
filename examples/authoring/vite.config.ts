import { foldkit } from '@foldkit/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  // Foldkit's view identity for the differ, and the Model kept across a dev reload.
  plugins: [foldkit()],
  // Workspace packages resolve to their source, so an edit shows without a build.
  resolve: { conditions: ['foldkit-plus:source'] },
  server: { host: '127.0.0.1' },
})
