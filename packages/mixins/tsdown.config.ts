import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/layers.ts',
    'src/theme.ts',
    'src/layout.ts',
    'src/defaults.ts',
    'src/prose.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: ['effect', 'foldkit'] },
})
