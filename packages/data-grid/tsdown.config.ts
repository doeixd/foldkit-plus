import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/crud.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  deps: {
    neverBundle: ['effect', 'foldkit', 'foldkit-bundle', 'foldkit-crud', 'foldkit-remote'],
  },
})
