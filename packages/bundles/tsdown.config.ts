import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/media/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: { neverBundle: ['effect', 'foldkit', 'foldkit-bundle'] },
})
