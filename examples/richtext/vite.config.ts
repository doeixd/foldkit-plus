import { defineConfig } from 'vite'

export default defineConfig({
  server: { host: '127.0.0.1', port: 5179 },
  resolve: {
    // The harness has no package.json of its own; the package is consumed from
    // source so a change here needs no build step.
    alias: {
      'foldkit-richtext': new URL('../../packages/richtext/src/index.ts', import.meta.url).pathname,
    },
  },
})
