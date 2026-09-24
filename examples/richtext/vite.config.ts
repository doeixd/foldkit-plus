import { defineConfig } from 'vite'

export default defineConfig({
  server: { host: '127.0.0.1', port: 5179 },
  resolve: {
    // The harness has no package.json of its own; the packages are consumed
    // from source so a change here needs no build step.
    alias: {
      'foldkit-richtext': new URL('../../packages/richtext/src/index.ts', import.meta.url).pathname,
      // The subpath before the bare package, so the more specific entry wins.
      'foldkit-richtext-dom/events': new URL(
        '../../packages/richtext-dom/src/events.ts',
        import.meta.url,
      ).pathname,
      'foldkit-richtext-dom': new URL('../../packages/richtext-dom/src/index.ts', import.meta.url)
        .pathname,
    },
  },
})
