import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/journal.ts', 'src/entity.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: ['effect', 'foldkit-surface', 'foldkit-durable', /^foldkit(\/.*)?$/] },
})
