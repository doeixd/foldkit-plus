import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/browser/index.ts',
    'src/icons/index.ts',
    'src/server/index.ts',
    'src/cloudflare/index.ts',
    'src/sharp/index.ts',
    'src/unpic/index.ts',
    'src/vite/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  // Not `node`: its runtime chunk, shared by every entry, carried `import "node:module"`
  // into the browser's (#215). The Node entries import their `node:` modules themselves.
  platform: 'neutral',
  fixedExtension: true,
  deps: { neverBundle: ['vite', '@cloudflare/workers-types'] },
})
