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
  deps: { neverBundle: ['vite', '@cloudflare/workers-types'] },
})
